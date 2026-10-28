"""MCP OAuth discovery, public-client flows and signed-in connection management."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.routing import APIRoute
from mcp.shared.auth import OAuthMetadata, ProtectedResourceMetadata
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, RedirectResponse

from app.auth import get_current_user_unrestricted, require_session_auth
from app.database import get_db
from app.models.oauth import OAuthClient, OAuthGrant
from app.models.user import User
from app.services import oauth

PUBLIC_CORS_PATHS = {
    "/mcp",
    "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server", "/oauth/register", "/oauth/token", "/oauth/revoke",
}


class OAuthPublicCors:
    """Browser-based MCP clients can discover/register/exchange without cookies.

    Consent and connection management retain the app's normal CORS policy.
    """
    def __init__(self, app):
        self.app = app
        self.public = CORSMiddleware(app, allow_origins=["*"], allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
                                     allow_headers=["Content-Type", "Authorization", "MCP-Protocol-Version", "Mcp-Session-Id"],
                                     expose_headers=["WWW-Authenticate"])

    async def __call__(self, scope, receive, send):
        target = self.public if scope.get("path") in PUBLIC_CORS_PATHS else self.app
        await target(scope, receive, send)


class OAuthRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request):
            try:
                response = await handler(request)
            except oauth.OAuthError as exc:
                response = JSONResponse({"error": exc.error, "error_description": exc.description},
                                        status_code=exc.status_code)
                if exc.status_code == 429:
                    response.headers["Retry-After"] = "3600"
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
            response.headers["Referrer-Policy"] = "no-referrer"
            return response

        return handle


router = APIRouter(tags=["oauth"], route_class=OAuthRoute)


def _params(pairs) -> dict[str, str]:
    params = {}
    for key, value in pairs:
        if key in params or len(value) > 4096:
            raise oauth.OAuthError("invalid_request", "Send each OAuth parameter once, with a value under 4097 characters.")
        params[key] = value
    return params


async def _body(request: Request) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 16384:
            raise oauth.OAuthError("invalid_request", "This OAuth request is too large. Send at most 16 KB.", 413)
    return bytes(body)


async def _form(request: Request) -> dict[str, str]:
    if request.headers.get("content-type", "").split(";", 1)[0].strip() != "application/x-www-form-urlencoded":
        raise oauth.OAuthError("invalid_request", "Send OAuth parameters as application/x-www-form-urlencoded.")
    try:
        return _params(parse_qsl((await _body(request)).decode("utf-8"), keep_blank_values=True, max_num_fields=30))
    except (UnicodeError, ValueError):
        raise oauth.OAuthError("invalid_request", "The OAuth form couldn't be read. Send a valid UTF-8 form.")


@router.get("/.well-known/oauth-protected-resource")
@router.get("/.well-known/oauth-protected-resource/mcp")
async def protected_resource():
    return ProtectedResourceMetadata(resource=oauth.resource_url(), authorization_servers=[oauth.issuer()],
                                     scopes_supported=[oauth.SCOPE], bearer_methods_supported=["header"],
                                     resource_name="TimeIQ").model_dump(mode="json", exclude_none=True)


@router.get("/.well-known/oauth-authorization-server")
async def authorization_server():
    base = oauth.issuer()
    return OAuthMetadata(
        issuer=base, authorization_endpoint=f"{base}/oauth/authorize", token_endpoint=f"{base}/oauth/token",
        registration_endpoint=f"{base}/oauth/register", revocation_endpoint=f"{base}/oauth/revoke",
        scopes_supported=[oauth.SCOPE], response_types_supported=["code"],
        grant_types_supported=["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported=["none"],
        revocation_endpoint_auth_methods_supported=["none"], code_challenge_methods_supported=["S256"],
        authorization_response_iss_parameter_supported=True,
    ).model_dump(mode="json", exclude_none=True)


class ClientRegistration(BaseModel):
    client_name: str = Field(default="MCP client", min_length=1, max_length=100)
    redirect_uris: list[str] = Field(min_length=1, max_length=10)
    token_endpoint_auth_method: str = "none"
    grant_types: list[str] = ["authorization_code", "refresh_token"]
    response_types: list[str] = ["code"]
    scope: str | None = None


@router.post("/oauth/register", status_code=201)
async def register(request: Request, db: AsyncSession = Depends(get_db)):
    if request.headers.get("content-type", "").split(";", 1)[0].strip() != "application/json":
        raise oauth.OAuthError("invalid_client_metadata", "Send client registration as application/json.")
    try:
        data = ClientRegistration.model_validate(json.loads(await _body(request)))
    except (ValueError, ValidationError):
        raise oauth.OAuthError("invalid_client_metadata", "Provide a client name and one to ten valid redirect URLs.")
    if any(not oauth.valid_redirect_uri(uri) for uri in data.redirect_uris):
        raise oauth.OAuthError("invalid_redirect_uri", "Use HTTPS or an HTTP localhost or loopback redirect URL without credentials or a fragment.")
    if (data.token_endpoint_auth_method != "none" or data.response_types != ["code"] or
            "authorization_code" not in data.grant_types or
            set(data.grant_types) - {"authorization_code", "refresh_token"} or
            any(ord(c) < 32 or ord(c) == 127 for c in data.client_name)):
        raise oauth.OAuthError("invalid_client_metadata", "Register a public client with the authorization_code flow and S256 PKCE.")
    oauth.check_scope(data.scope)
    client = await oauth.register(db, data.client_name, data.redirect_uris, request.client.host if request.client else "unknown")
    await db.commit()
    return {"client_id": client.id, "client_id_issued_at": int(client.created_at.timestamp()),
            "client_name": client.name, "redirect_uris": client.redirect_uris, "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "scope": oauth.SCOPE}


@router.get("/oauth/authorize")
async def authorize(request: Request, db: AsyncSession = Depends(get_db)):
    params = _params(request.query_params.multi_items())
    if any(key in params for key in ("request", "request_uri")):
        raise oauth.OAuthError("invalid_request", "Send authorization parameters directly to this endpoint.")
    url = await oauth.authorize(db, params)
    await db.commit()
    return RedirectResponse(url, status_code=302)


@router.post("/oauth/token")
async def token(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _form(request)
    if request.headers.get("Authorization"):
        raise oauth.OAuthError("invalid_client", "Use a public client ID in the form without client authentication.")
    out = await oauth.exchange(db, params)
    await db.commit()
    return out.model_dump(exclude_none=True)


@router.post("/oauth/revoke")
async def revoke(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _form(request)
    if not params.get("token"):
        raise oauth.OAuthError("invalid_request", "Send the token to disconnect this app.")
    if params.get("client_secret") or request.headers.get("Authorization"):
        raise oauth.OAuthError("invalid_client", "Use a public client ID in the form without client authentication.")
    await oauth.revoke(db, params.get("client_id", ""), params["token"])
    await db.commit()
    return {}


class ConsentDecision(BaseModel):
    request: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")
    allow: bool


@router.get("/api/oauth/consent")
async def consent_details(
    request: str,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    if len(request) != 43:
        raise oauth.OAuthError("invalid_request", "This connection request is invalid. Add the connector again.")
    code = await oauth.consent_request(db, request)
    client = await db.get(OAuthClient, code.client_id)
    return {"client_name": client.name, "redirect_uri": code.redirect_uri, "resource": code.resource,
            "email": user.email}


@router.post("/api/oauth/consent")
async def consent_decision(
    data: ConsentDecision,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    url = await oauth.consent(db, data.request, user, data.allow)
    await db.commit()
    return {"redirect_url": url}


class ConnectionOut(BaseModel):
    id: uuid.UUID
    client_name: str
    created_at: datetime
    last_used_at: datetime | None


@router.get("/api/me/connections", response_model=list[ConnectionOut])
async def connections(
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(OAuthGrant, OAuthClient.name).join(OAuthClient).where(
        OAuthGrant.user_id == user.id, OAuthGrant.revoked_at.is_(None), OAuthGrant.expires_at > oauth.now(),
    ).order_by(OAuthGrant.created_at.desc()))).all()
    return [ConnectionOut(id=g.id, client_name=name, created_at=g.created_at, last_used_at=g.last_used_at) for g, name in rows]


@router.delete("/api/me/connections/{connection_id}", status_code=204)
async def disconnect(
    connection_id: uuid.UUID,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    grant = await oauth._locked_grant(db, connection_id)
    if grant is None or grant.user_id != user.id or grant.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Connection not found. Refresh Settings to see your connected apps.")
    grant.revoked_at = oauth.now()
    await db.commit()
