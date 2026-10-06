from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
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

router = APIRouter(prefix="/api/google", tags=["google-auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/calendar.readonly"

# OAuth CSRF protection. The state names the user and a nonce, signed so it
# can't be forged, and the same nonce is set as a cookie in the browser that
# started the flow. The callback needs both, so a link an attacker generated
# for their own account fails in anyone else's browser.
STATE_COOKIE = "timeiq_google_oauth"
STATE_TTL_SECONDS = 600


def _sign(payload: str) -> str:
    key = settings.GOOGLE_CLIENT_SECRET.encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def make_state(user_id: uuid.UUID, nonce: str, now: float | None = None) -> str:
    expires = int((now or time.time()) + STATE_TTL_SECONDS)
    payload = f"{user_id}.{nonce}.{expires}"
    return f"{payload}.{_sign(payload)}"


def read_state(state: str, cookie_nonce: str | None, now: float | None = None) -> uuid.UUID:
    """The user id from a state that is signed, unexpired and bound to this browser."""
    try:
        user_id, nonce, expires, sig = state.split(".")
        parsed = uuid.UUID(user_id)
        expires_at = int(expires)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid state parameter")
    if not hmac.compare_digest(sig, _sign(f"{user_id}.{nonce}.{expires}")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid state parameter")
    if expires_at < (now or time.time()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sign-in link expired; try again")
    if not cookie_nonce or not hmac.compare_digest(nonce, cookie_nonce):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This Google sign-in was started in a different browser",
        )
    return parsed


@router.get("/auth-url")
async def get_google_auth_url(
    response: Response,
    user: User = Depends(get_current_user),
):
    """Generate a Google OAuth2 authorization URL.

    Call this with credentials included (fetch `credentials: "include"`), so the
    browser keeps the nonce cookie the callback checks."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google Calendar integration is not configured",
        )

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": "",
    }
    nonce = secrets.token_urlsafe(24)
    params["state"] = make_state(user.id, nonce)
    # timeiq.app and api.timeiq.app are same-site, so Lax suffices and the cookie
    # rides along on Google's top-level redirect back to the callback.
    response.set_cookie(
        STATE_COOKIE,
        nonce,
        max_age=STATE_TTL_SECONDS,
        httponly=True,
        secure=settings.GOOGLE_REDIRECT_URI.startswith("https"),
        samesite="lax",
        path="/api/google",
    )
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"url": auth_url}


@router.get("/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    nonce_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle the Google OAuth2 callback.
    Exchange the authorization code for tokens and create a calendar source.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google Calendar integration is not configured",
        )

    user_id = read_state(state, nonce_cookie)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Exchange authorization code for tokens
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange authorization code for tokens",
            )
        token_data = resp.json()

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # Fetch the list of calendars to get the primary calendar info
    async with httpx.AsyncClient(timeout=15.0) as client:
        cal_resp = await client.get(
            "https://www.googleapis.com/calendar/v3/users/me/calendarList",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"maxResults": "10"},
        )

    calendar_name = "Google Calendar"
    calendar_id = "primary"
    if cal_resp.status_code == 200:
        cal_data = cal_resp.json()
        for cal in cal_data.get("items", []):
            if cal.get("primary"):
                calendar_name = cal.get("summary", "Google Calendar")
                calendar_id = cal.get("id", "primary")
                break

    # Create the calendar source
    source = CalendarSource(
        user_id=user.id,
        type="google",
        name=calendar_name,
        google_access_token=access_token,
        google_refresh_token=refresh_token,
        google_token_expires_at=expires_at,
        google_calendar_id=calendar_id,
        is_active=True,
    )
    db.add(source)
    await db.flush()

    # Redirect back to frontend
    redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/calendars?google=connected")
    redirect.delete_cookie(STATE_COOKIE, path="/api/google")
    return redirect
