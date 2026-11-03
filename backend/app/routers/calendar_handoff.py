"""Connect Google or Outlook from the mobile app.

The web flow binds a sign-in to the browser that started it with a cookie set
by an authenticated fetch. The app can't share cookies with the system browser,
so it uses a handoff instead:

1. start: the signed-in app sends the SHA-256 of a secret it keeps (PKCE-style)
   and gets a one-time launch link that lives for ten minutes.
2. launch: the browser opens the link once. It gets the provider's usual state
   cookie and is sent on to Google or Microsoft.
3. callback: the provider returns to the usual callback, which sees the "m."
   state, checks the cookie, parks the sign-in code and sends the browser back
   to the app. Nothing is connected yet.
4. finish: the app, signed in as the same account, sends the handoff id and its
   secret. Only then is the code exchanged and the calendar added.

A launch link sent to someone else gets them nowhere: their phone has neither
the secret nor the account that started it.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.calendar_handoff import CalendarHandoff
from app.models.user import User
from app.routers import google_auth, microsoft_auth

router = APIRouter(prefix="/api/calendar-connect", tags=["calendar-connect"])

Provider = Literal["google", "microsoft"]
APP_RETURN_URL = "timeiq://calendars"
HANDOFF_TTL = timedelta(minutes=10)


def _challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _sign(provider: str, payload: str) -> str:
    return (google_auth._sign if provider == "google" else microsoft_auth._sign)(payload)


def _state(provider: str, handoff_id: uuid.UUID, expires_at: datetime) -> str:
    payload = f"m.{handoff_id}.{int(expires_at.timestamp())}"
    return f"{payload}.{_sign(provider, payload)}"


def _cookie(provider: str) -> tuple[str, str]:
    if provider == "google":
        return google_auth.STATE_COOKIE, "/api/google"
    return microsoft_auth.STATE_COOKIE, "/api/microsoft"


def _to_app(provider: str, **params: str) -> RedirectResponse:
    redirect = RedirectResponse(url=f"{APP_RETURN_URL}?{urlencode({'connect': provider, **params})}", status_code=302)
    name, path = _cookie(provider)
    redirect.delete_cookie(name, path=path)
    redirect.headers["Cache-Control"] = "no-store"
    return redirect


def _require(provider: str) -> None:
    if provider == "google" and not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google Calendar integration is not configured")
    if provider == "microsoft" and not settings.microsoft_enabled:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Outlook is not configured. Contact TimeIQ to enable it.")


class StartIn(BaseModel):
    challenge: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class FinishIn(BaseModel):
    handoff: uuid.UUID
    verifier: str = Field(min_length=43, max_length=128)


@router.post("/{provider}/start")
async def start(provider: Provider, payload: StartIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require(provider)
    now = datetime.now(timezone.utc)
    # Old handoffs are never needed again.
    await db.execute(delete(CalendarHandoff).where(CalendarHandoff.user_id == user.id, CalendarHandoff.expires_at < now))
    token = secrets.token_urlsafe(32)
    db.add(CalendarHandoff(
        user_id=user.id,
        provider=provider,
        launch_token_hash=_token_hash(token),
        app_challenge=payload.challenge,
        browser_secret=secrets.token_urlsafe(64 if provider == "microsoft" else 24),
        expires_at=now + HANDOFF_TTL,
    ))
    await db.flush()
    # Launch on the callback's own host, so the cookie set here comes back with it.
    callback = settings.GOOGLE_REDIRECT_URI if provider == "google" else settings.microsoft_redirect_uri
    origin = "{0.scheme}://{0.netloc}".format(urlsplit(callback))
    return {"url": f"{origin}/api/calendar-connect/launch?{urlencode({'t': token})}"}


@router.get("/launch")
async def launch(t: str = Query(..., min_length=20, max_length=100), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    # Each launch link works once.
    handoff = (await db.execute(
        update(CalendarHandoff)
        .where(CalendarHandoff.launch_token_hash == _token_hash(t), CalendarHandoff.launched_at.is_(None), CalendarHandoff.expires_at > now)
        .values(launched_at=now)
        .returning(CalendarHandoff)
    )).scalar_one_or_none()
    if handoff is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in link has expired or was already used. Start again in the TimeIQ app.")
    _require(handoff.provider)
    state = _state(handoff.provider, handoff.id, handoff.expires_at)
    if handoff.provider == "google":
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": google_auth.SCOPES,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        url = f"{google_auth.GOOGLE_AUTH_URL}?{urlencode(params)}"
        secure = settings.GOOGLE_REDIRECT_URI.startswith("https")
    else:
        params = {
            "client_id": settings.MS_CLIENT_ID,
            "redirect_uri": settings.microsoft_redirect_uri,
            "response_type": "code",
            "response_mode": "query",
            "scope": microsoft_auth.SCOPES,
            "prompt": "select_account",
            "state": state,
            "code_challenge": microsoft_auth.pkce_challenge(handoff.browser_secret),
            "code_challenge_method": "S256",
        }
        url = f"{microsoft_auth.authority_url()}/authorize?{urlencode(params)}"
        secure = settings.microsoft_redirect_uri.startswith("https://")
    redirect = RedirectResponse(url=url, status_code=302)
    name, path = _cookie(handoff.provider)
    redirect.set_cookie(name, handoff.browser_secret, max_age=int(HANDOFF_TTL.total_seconds()), httponly=True, secure=secure, samesite="lax", path=path)
    redirect.headers["Cache-Control"] = "no-store"
    return redirect


async def park_code(db: AsyncSession, provider: str, state: str, code: str | None, error_outcome: str | None, cookie: str | None) -> RedirectResponse:
    """The provider callback for an app sign-in: keep the code for finish()."""
    try:
        _, handoff_id, expires, sig = state.split(".")
        parsed = uuid.UUID(handoff_id)
        expires_at = int(expires)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid state parameter") from None
    if not hmac.compare_digest(sig.encode(), _sign(provider, f"m.{handoff_id}.{expires}").encode()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid state parameter")
    if expires_at < time.time():
        return _to_app(provider, outcome="expired")
    handoff = (await db.execute(
        select(CalendarHandoff).where(CalendarHandoff.id == parsed, CalendarHandoff.provider == provider).with_for_update()
    )).scalar_one_or_none()
    if handoff is None or handoff.launched_at is None or handoff.completed_at is not None or handoff.code is not None:
        return _to_app(provider, outcome="expired")
    # The browser that finishes must be the one that launched.
    if not cookie or not hmac.compare_digest(cookie.encode(), handoff.browser_secret.encode()):
        return _to_app(provider, outcome="failed")
    if error_outcome or not code:
        handoff.outcome = error_outcome or "failed"
        handoff.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return _to_app(provider, outcome=handoff.outcome)
    handoff.code = code
    await db.flush()
    return _to_app(provider, handoff=str(handoff.id))


@router.post("/finish")
async def finish(payload: FinishIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    handoff = (await db.execute(
        select(CalendarHandoff).where(CalendarHandoff.id == payload.handoff, CalendarHandoff.user_id == user.id).with_for_update()
    )).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if (
        handoff is None
        or handoff.completed_at is not None
        or handoff.code is None
        or handoff.expires_at < now
        or not hmac.compare_digest(_challenge(payload.verifier).encode(), handoff.app_challenge.encode())
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in expired. Start connecting again.")
    code, handoff.code, handoff.completed_at = handoff.code, None, now
    await db.flush()
    if handoff.provider == "google":
        source = await google_auth.connect_google(db, user, code)
    else:
        source = await microsoft_auth.connect_microsoft(db, user, code, handoff.browser_secret)
        if source is None:
            handoff.outcome = "failed"
            await db.flush()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Outlook didn't accept the sign-in. Try connecting again.")
    handoff.outcome = "connected"
    await db.flush()
    return {"connected": True, "name": source.name}
