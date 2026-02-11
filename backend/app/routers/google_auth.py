from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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


@router.get("/auth-url")
async def get_google_auth_url(
    user: User = Depends(get_current_user),
):
    """Generate a Google OAuth2 authorization URL."""
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
        "state": str(user.id),
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"url": auth_url}


@router.get("/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
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

    # Verify the user exists
    try:
        user_id = uuid.UUID(state)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter",
        )

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
    redirect_url = f"{settings.FRONTEND_URL}/dashboard/calendars?google=connected"
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url=redirect_url)
