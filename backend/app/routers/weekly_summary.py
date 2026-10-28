"""Signed unsubscribe links for Your week emails."""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services import weekly_summary

router = APIRouter(tags=["weekly-summary"])


async def _summary_subscriber(db, token):
    now = datetime.now(timezone.utc)
    uid = weekly_summary.token_user_id(token, now)
    user = await db.get(User, uid) if uid else None
    if user is None or not weekly_summary.valid_token(user, token, now):
        raise HTTPException(status_code=400, detail="This unsubscribe link expired or is invalid. Turn off Your week in Settings.")
    return user


@router.get("/api/weekly-summary/unsubscribe", response_class=HTMLResponse)
async def summary_unsubscribe_page(token: str = Query(..., max_length=200), db: AsyncSession = Depends(get_db)):
    await _summary_subscriber(db, token)
    # Email scanners follow GET links. Only a POST changes the preference.
    return HTMLResponse(
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>Unsubscribe from Your week</title><body><h1>Unsubscribe from Your week</h1>'
        '<form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click">'
        f'<input type="hidden" name="token" value="{escape(token, quote=True)}">'
        '<button type="submit">Unsubscribe</button></form></body></html>',
        headers={"Referrer-Policy": "no-referrer", "Cache-Control": "no-store"},
    )


@router.post("/api/weekly-summary/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_summary(request: Request, token: str = Query(..., max_length=200), db: AsyncSession = Depends(get_db)):
    body = await request.body()
    if len(body) > 1000 or parse_qs(body.decode(errors="replace")).get("List-Unsubscribe") != ["One-Click"]:
        raise HTTPException(status_code=400, detail="Unsubscribe was not submitted. Use the unsubscribe button in the email.")
    user = await _summary_subscriber(db, token)
    user.weekly_summary_enabled = False
    await db.commit()
    return HTMLResponse("<p>Your week emails are turned off. You can turn them on again in Settings.</p>",
                        headers={"Cache-Control": "no-store"})
