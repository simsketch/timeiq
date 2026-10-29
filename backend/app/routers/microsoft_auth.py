from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.services.calendar_health import CalendarSyncError, classify, record_failure, record_success
from app.services.microsoft_calendar import (
    GRAPH_URL,
    SCOPES,
    authority_url,
    response_data,
    sync_microsoft_source,
    token_values,
)

router = APIRouter(prefix="/api/microsoft", tags=["microsoft-auth"])

STATE_COOKIE = "timeiq_microsoft_oauth"
STATE_TTL_SECONDS = 600


def pkce_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


def _sign(payload: str) -> str:
    return hmac.new(settings.MS_CLIENT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_state(user_id: uuid.UUID, verifier: str, now: float | None = None) -> str:
    expires = int((time.time() if now is None else now) + STATE_TTL_SECONDS)
    payload = f"{user_id}.{pkce_challenge(verifier)}.{expires}"
    return f"{payload}.{_sign(payload)}"


def read_state(state: str, cookie_verifier: str | None, now: float | None = None) -> uuid.UUID:
    """A signed, expiring user id bound to the browser's HttpOnly PKCE cookie."""
    try:
        user_id, challenge, expires, sig = state.split(".")
        parsed = uuid.UUID(user_id)
        expires_at = int(expires)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Outlook sign-in is invalid. Start connecting Outlook again.") from None
    if not hmac.compare_digest(sig.encode(), _sign(f"{user_id}.{challenge}.{expires}").encode()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Outlook sign-in is invalid. Start connecting Outlook again.")
    if expires_at < (time.time() if now is None else now):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Outlook sign-in expired. Start connecting Outlook again.")
    if not cookie_verifier or not hmac.compare_digest(challenge.encode(), pkce_challenge(cookie_verifier).encode()):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Outlook sign-in started in a different browser. Start connecting Outlook in this browser.",
        )
    return parsed


def _require_configured() -> None:
    if not settings.microsoft_enabled:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Outlook is not configured. Contact TimeIQ to enable it.")


@router.get("/status")
async def microsoft_status():
    return {"enabled": settings.microsoft_enabled,
            "auth_url": f"{settings.BACKEND_URL.rstrip('/')}/api/microsoft/auth-url"}


@router.get("/auth-url")
async def get_microsoft_auth_url(response: Response, user: User = Depends(get_current_user)):
    _require_configured()
    verifier = secrets.token_urlsafe(64)
    params = {
        "client_id": settings.MS_CLIENT_ID,
        "redirect_uri": settings.microsoft_redirect_uri,
        "response_type": "code",
        "response_mode": "query",
        "scope": SCOPES,
        "prompt": "select_account",
        "state": make_state(user.id, verifier),
        "code_challenge": pkce_challenge(verifier),
        "code_challenge_method": "S256",
    }
    # The verifier stays in this browser and is sent only to the token endpoint.
    response.set_cookie(
        STATE_COOKIE,
        verifier,
        max_age=STATE_TTL_SECONDS,
        httponly=True,
        secure=settings.microsoft_redirect_uri.startswith("https://"),
        samesite="lax",
        path="/api/microsoft",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"url": f"{authority_url()}/authorize?{urlencode(params)}"}


def _redirect(outcome: str) -> RedirectResponse:
    redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/calendars?microsoft={outcome}")
    redirect.delete_cookie(STATE_COOKIE, path="/api/microsoft")
    redirect.headers["Cache-Control"] = "no-store"
    return redirect


# AADSTS65001 and AADSTS90094: the user's organization requires an admin to
# consent before its members can connect this app.
ADMIN_CONSENT_CODES = ("AADSTS65001", "AADSTS90094", "AADSTS90095")


def _error_outcome(error: str, description: str | None) -> str:
    if error == "consent_required" or any(code in (description or "") for code in ADMIN_CONSENT_CODES):
        return "admin"
    return "denied" if error == "access_denied" else "failed"


@router.get("/callback")
async def microsoft_callback(
    state: str = Query(...),
    code: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    verifier_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE),
    db: AsyncSession = Depends(get_db),
):
    _require_configured()
    user_id = read_state(state, verifier_cookie)
    if error:
        return _redirect(_error_outcome(error, error_description))
    if not code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Outlook returned no sign-in code. Start connecting Outlook again.")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Your TimeIQ account was not found. Sign in to TimeIQ again.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                f"{authority_url()}/token",
                data={
                    "client_id": settings.MS_CLIENT_ID,
                    "client_secret": settings.MS_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.microsoft_redirect_uri,
                    "code_verifier": verifier_cookie,
                    "scope": SCOPES,
                },
            )
            data = response_data(resp)
            if resp.status_code != 200 or not isinstance(data.get("refresh_token"), str) or not data["refresh_token"]:
                return _redirect("failed")
            access_token, expires_at = token_values(data)
            profile_resp = await client.get(
                f"{GRAPH_URL}/me",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"$select": "id,mail,userPrincipalName,displayName"},
            )
        except (httpx.TransportError, CalendarSyncError):
            return _redirect("failed")
    profile = response_data(profile_resp)
    account_id = profile.get("id")
    if profile_resp.status_code != 200 or not isinstance(account_id, str) or not account_id or len(account_id) > 255:
        return _redirect("failed")

    # Ownership comes from the signed state, never from a callback user id.
    # Reconnecting updates this owner's existing account and clears its health.
    source = (
        await db.execute(
            select(CalendarSource).where(
                CalendarSource.user_id == user.id,
                CalendarSource.type == "microsoft",
                CalendarSource.microsoft_account_id == account_id,
            )
        )
    ).scalars().first()
    if source is None:
        source = CalendarSource(user_id=user.id, type="microsoft", microsoft_account_id=account_id)
        db.add(source)
    label = profile.get("mail") or profile.get("userPrincipalName") or profile.get("displayName")
    source.name = f"Outlook · {label}"[:255] if label else "Outlook"
    source.microsoft_access_token = access_token
    source.microsoft_refresh_token = data["refresh_token"]
    source.microsoft_token_expires_at = expires_at
    source.is_active = True
    now = datetime.now(timezone.utc)
    record_success(source, now)
    await db.flush()
    try:
        await sync_microsoft_source(db, source)
    except Exception as exc:
        record_failure(source, classify(exc), now)
    await db.flush()
    return _redirect("connected")
