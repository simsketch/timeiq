"""Opaque OAuth credentials for MCP. All secrets are stored as SHA-256 hashes.

The HTTP handlers use SDK metadata/token models, with transactions here rather
than the SDK's separate load/verify/exchange hooks: code consumption and refresh
rotation must be atomic across serverless invocations.
"""
from __future__ import annotations

import base64
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.oauth import OAuthAccessToken, OAuthAuthorizationCode, OAuthClient, OAuthGrant, OAuthRefreshToken
from app.models.user import User

if TYPE_CHECKING:  # the MCP SDK is slow to import; load it only when issuing tokens
    from mcp.shared.auth import OAuthToken

ACCESS_PREFIX = "tiqoa_"
REFRESH_PREFIX = "tiqor_"
SCOPE = "mcp"
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=60)
CONSENT_TTL = timedelta(minutes=10)
CODE_TTL = timedelta(minutes=2)
_VERIFIER = re.compile(r"[A-Za-z0-9._~-]{43,128}")
_CHALLENGE = re.compile(r"[A-Za-z0-9_-]{43}")


class OAuthError(Exception):
    def __init__(self, error: str, description: str, status_code: int = 400):
        self.error = error
        self.description = description
        self.status_code = status_code


def now() -> datetime:
    return datetime.now(timezone.utc)


def issuer() -> str:
    return settings.BACKEND_URL.rstrip("/")


def resource_url() -> str:
    return f"{issuer()}/mcp"


def hash_secret(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def looks_like_token(raw: str) -> bool:
    return raw.startswith(ACCESS_PREFIX)


def valid_redirect_uri(uri: str) -> bool:
    if len(uri) > 2048 or any(ord(c) < 33 or ord(c) > 126 for c in uri) or "\\" in uri or "#" in uri:
        return False
    try:
        parsed = urlsplit(uri)
        # Accessing port also checks malformed/out-of-range ports.
        parsed.port
        return bool(parsed.hostname and parsed.username is None and parsed.password is None and (
            parsed.scheme == "https" or
            (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"})
        ) and not {key for key, _ in parse_qsl(parsed.query)} & {"code", "state", "iss", "error", "error_description"})
    except ValueError:
        return False


def check_resource(resource: str | None) -> None:
    if resource != resource_url():
        raise OAuthError("invalid_target", "Use the MCP resource URL from TimeIQ's protected resource metadata.")


def check_scope(scope: str | None) -> str:
    if scope is not None and scope.split() != [SCOPE]:
        raise OAuthError("invalid_scope", "Request the mcp scope to connect to TimeIQ.")
    return SCOPE


def redirect_url(request: OAuthAuthorizationCode, **params: str) -> str:
    parsed = urlsplit(request.redirect_uri)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    query.extend(params.items())
    query.append(("iss", issuer()))
    if request.state is not None:
        query.append(("state", request.state))
    return urlunsplit(parsed._replace(query=urlencode(query)))


async def register(db: AsyncSession, name: str, redirect_uris: list[str], ip: str) -> OAuthClient:
    # A database lock and persisted counts survive cold starts and concurrent
    # workers. Trust the ASGI peer address, never a caller-supplied forwarding header.
    await db.execute(select(func.pg_advisory_xact_lock(1414091001)))
    since = now() - timedelta(hours=1)
    ip_hash = hash_secret(ip)
    total = await db.scalar(select(func.count()).select_from(OAuthClient).where(OAuthClient.created_at > since))
    per_ip = await db.scalar(select(func.count()).select_from(OAuthClient).where(
        OAuthClient.created_at > since, OAuthClient.registration_ip_hash == ip_hash,
    ))
    if total >= 300 or per_ip >= 10:
        raise OAuthError("invalid_request", "Registration limit reached. Try again in an hour.", 429)
    client = OAuthClient(id=secrets.token_urlsafe(32), name=name.strip() or "MCP client",
                         redirect_uris=redirect_uris, registration_ip_hash=ip_hash)
    db.add(client)
    await db.flush()
    return client


async def authorize(db: AsyncSession, params: dict[str, str]) -> str:
    client = await db.get(OAuthClient, params.get("client_id", ""))
    if client is None:
        raise OAuthError("invalid_client", "This app isn't registered. Add the TimeIQ connector again.")
    redirect_uri = params.get("redirect_uri", "")
    if redirect_uri not in client.redirect_uris:
        raise OAuthError("invalid_request", "The redirect URL doesn't match this app's registration. Add the connector again.")
    if params.get("response_type") != "code":
        raise OAuthError("unsupported_response_type", "Use the authorization code flow to connect to TimeIQ.")
    if params.get("code_challenge_method") != "S256" or not _CHALLENGE.fullmatch(params.get("code_challenge", "")):
        raise OAuthError("invalid_request", "Use a valid S256 PKCE challenge to connect to TimeIQ.")
    check_resource(params.get("resource"))
    scope = check_scope(params.get("scope"))
    state = params.get("state")
    if state is not None and len(state) > 2048:
        raise OAuthError("invalid_request", "The state is too long. Start the connection again.")
    # Bound the number of live requests one registered client can create.
    await db.execute(select(OAuthClient).where(OAuthClient.id == client.id).with_for_update())
    pending = await db.scalar(select(func.count()).select_from(OAuthAuthorizationCode).where(
        OAuthAuthorizationCode.client_id == client.id, OAuthAuthorizationCode.expires_at > now(),
        OAuthAuthorizationCode.decided_at.is_(None),
    ))
    if pending >= 50:
        raise OAuthError("invalid_request", "Too many connection requests. Try again in ten minutes.", 429)
    raw = secrets.token_urlsafe(32)
    db.add(OAuthAuthorizationCode(request_hash=hash_secret(raw), client_id=client.id, redirect_uri=redirect_uri,
                                  code_challenge=params["code_challenge"], resource=resource_url(), scope=scope,
                                  state=state, expires_at=now() + CONSENT_TTL))
    await db.flush()
    return f"{settings.FRONTEND_URL.rstrip('/')}/oauth/consent?{urlencode({'request': raw})}"


async def consent_request(db: AsyncSession, raw: str, *, lock: bool = False) -> OAuthAuthorizationCode:
    stmt = select(OAuthAuthorizationCode).where(OAuthAuthorizationCode.request_hash == hash_secret(raw))
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    code = (await db.execute(stmt)).scalar_one_or_none()
    if code is None or code.expires_at <= now() or code.decided_at is not None:
        raise OAuthError("invalid_request", "This connection request expired or was already answered. Add the connector again.")
    return code


async def consent(db: AsyncSession, raw: str, user: User, allow: bool) -> str:
    code = await consent_request(db, raw, lock=True)
    code.decided_at = now()
    if not allow:
        return redirect_url(code, error="access_denied", error_description="You cancelled the connection.")
    grant = OAuthGrant(client_id=code.client_id, user_id=user.id, resource=code.resource, scope=code.scope,
                       expires_at=now() + REFRESH_TTL)
    db.add(grant)
    await db.flush()
    raw_code = secrets.token_urlsafe(32)
    code.code_hash = hash_secret(raw_code)
    code.user_id = user.id
    code.grant_id = grant.id
    code.expires_at = now() + CODE_TTL
    return redirect_url(code, code=raw_code)


async def _locked_grant(db: AsyncSession, grant_id: uuid.UUID) -> OAuthGrant | None:
    return (await db.execute(select(OAuthGrant).where(OAuthGrant.id == grant_id).with_for_update()
                             .execution_options(populate_existing=True))).scalar_one_or_none()


async def _replay(db: AsyncSession, grant: OAuthGrant) -> None:
    grant.revoked_at = now()
    # Persist replay revocation even though the caller gets an OAuth error.
    await db.commit()
    raise OAuthError("invalid_grant", "This credential was already used. Add the TimeIQ connector again.")


async def _issue(db: AsyncSession, grant: OAuthGrant) -> OAuthToken:
    from mcp.shared.auth import OAuthToken

    access = ACCESS_PREFIX + secrets.token_urlsafe(32)
    refresh = REFRESH_PREFIX + secrets.token_urlsafe(32)
    expires_at = min(now() + ACCESS_TTL, grant.expires_at)
    db.add(OAuthAccessToken(grant_id=grant.id, token_hash=hash_secret(access), expires_at=expires_at))
    db.add(OAuthRefreshToken(grant_id=grant.id, token_hash=hash_secret(refresh), expires_at=grant.expires_at))
    await db.flush()
    return OAuthToken(access_token=access, token_type="Bearer", expires_in=max(1, int((expires_at - now()).total_seconds())),
                      refresh_token=refresh, scope=grant.scope)


async def exchange(db: AsyncSession, params: dict[str, str]) -> OAuthToken:
    client = await db.get(OAuthClient, params.get("client_id", ""))
    if client is None or params.get("client_secret"):
        raise OAuthError("invalid_client", "Use this app's registered public client ID.")
    check_resource(params.get("resource"))
    grant_type = params.get("grant_type")
    if grant_type == "authorization_code":
        code = (await db.execute(select(OAuthAuthorizationCode).where(
            OAuthAuthorizationCode.code_hash == hash_secret(params.get("code", "")),
            OAuthAuthorizationCode.client_id == client.id,
        ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
        verifier = params.get("code_verifier", "")
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        if (code is None or code.grant_id is None or code.redirect_uri != params.get("redirect_uri") or
                code.resource != params["resource"] or not _VERIFIER.fullmatch(verifier) or
                not secrets.compare_digest(code.code_challenge, challenge)):
            raise OAuthError("invalid_grant", "The code, redirect URL or PKCE verifier didn't match. Start the connection again.")
        grant = await _locked_grant(db, code.grant_id)
        if grant is None or grant.revoked_at is not None or grant.expires_at <= now():
            raise OAuthError("invalid_grant", "This connection expired or was disconnected. Add the connector again.")
        if code.consumed_at is not None:
            await _replay(db, grant)
        if code.expires_at <= now():
            raise OAuthError("invalid_grant", "This authorization code expired. Start the connection again.")
        code.consumed_at = now()
    elif grant_type == "refresh_token":
        raw = params.get("refresh_token", "")
        token = (await db.execute(select(OAuthRefreshToken).where(
            OAuthRefreshToken.token_hash == hash_secret(raw),
        ))).scalar_one_or_none() if raw.startswith(REFRESH_PREFIX) else None
        grant = await _locked_grant(db, token.grant_id) if token else None
        if (grant is None or grant.client_id != client.id or grant.resource != params["resource"] or
                grant.revoked_at is not None or grant.expires_at <= now()):
            raise OAuthError("invalid_grant", "This refresh token expired or was disconnected. Add the connector again.")
        check_scope(params.get("scope"))
        # Reload after the family lock: another invocation may have rotated it.
        await db.refresh(token)
        if token.consumed_at is not None:
            await _replay(db, grant)
        if token.expires_at <= now():
            raise OAuthError("invalid_grant", "This refresh token expired. Add the connector again.")
        token.consumed_at = now()
    else:
        raise OAuthError("unsupported_grant_type", "Use the authorization_code or refresh_token grant.")
    return await _issue(db, grant)


async def revoke(db: AsyncSession, client_id: str, raw: str) -> None:
    if await db.get(OAuthClient, client_id) is None:
        raise OAuthError("invalid_client", "Use this app's registered public client ID.")
    model = OAuthRefreshToken if raw.startswith(REFRESH_PREFIX) else OAuthAccessToken
    token = (await db.execute(select(model).where(model.token_hash == hash_secret(raw)))).scalar_one_or_none()
    grant = await _locked_grant(db, token.grant_id) if token else None
    if grant is not None and grant.client_id == client_id and grant.revoked_at is None:
        grant.revoked_at = now()


async def user_for(db: AsyncSession, raw: str) -> User | None:
    if not looks_like_token(raw) or len(raw) > 100:
        return None
    at = now()
    row = (await db.execute(select(OAuthGrant, User).join(OAuthAccessToken, OAuthAccessToken.grant_id == OAuthGrant.id)
                           .join(User, User.id == OAuthGrant.user_id).where(
                               OAuthAccessToken.token_hash == hash_secret(raw), OAuthAccessToken.expires_at > at,
                               OAuthGrant.revoked_at.is_(None), OAuthGrant.expires_at > at,
                               OAuthGrant.resource == resource_url(), OAuthGrant.scope == SCOPE,
                           ))).first()
    if row is None:
        return None
    grant, user = row
    if grant.last_used_at is None or at - grant.last_used_at > timedelta(minutes=5):
        await db.execute(update(OAuthGrant).where(OAuthGrant.id == grant.id, OAuthGrant.revoked_at.is_(None))
                         .values(last_used_at=at))
        await db.commit()
    return user
