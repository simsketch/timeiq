from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

import httpx
from icalendar import Calendar
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.config import settings


async def sync_ics_source(db: AsyncSession, source: CalendarSource) -> int:
    """
    Fetch events from an ICS URL and upsert them into cached_events.
    Returns the number of events synced.
    """
    if not source.ics_url:
        return 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(source.ics_url)
        resp.raise_for_status()
        ics_text = resp.text

    cal = Calendar.from_ical(ics_text)
    synced_count = 0

    # Delete existing cached events for this source before re-importing
    await db.execute(
        delete(CachedEvent).where(CachedEvent.calendar_source_id == source.id)
    )

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        dtstart = component.get("dtstart")
        dtend = component.get("dtend")
        if dtstart is None:
            continue

        dtstart_val = dtstart.dt
        dtend_val = dtend.dt if dtend else None

        # Determine if it's an all-day event
        is_all_day = not isinstance(dtstart_val, datetime)

        if is_all_day:
            # Convert date to datetime for storage
            starts_at = datetime.combine(
                dtstart_val, datetime.min.time(), tzinfo=timezone.utc
            )
            if dtend_val:
                ends_at = datetime.combine(
                    dtend_val, datetime.min.time(), tzinfo=timezone.utc
                )
            else:
                ends_at = starts_at + timedelta(days=1)
        else:
            starts_at = (
                dtstart_val
                if dtstart_val.tzinfo
                else dtstart_val.replace(tzinfo=timezone.utc)
            )
            if dtend_val:
                ends_at = (
                    dtend_val
                    if dtend_val.tzinfo
                    else dtend_val.replace(tzinfo=timezone.utc)
                )
            else:
                ends_at = starts_at + timedelta(hours=1)

        uid = str(component.get("uid", ""))
        summary = str(component.get("summary", ""))

        event = CachedEvent(
            id=uuid.uuid4(),
            calendar_source_id=source.id,
            user_id=source.user_id,
            title=summary[:500] if summary else None,
            starts_at=starts_at,
            ends_at=ends_at,
            is_all_day=is_all_day,
            external_id=uid[:500] if uid else None,
        )
        db.add(event)
        synced_count += 1

    # Update last_synced_at
    source.last_synced_at = datetime.now(timezone.utc)
    await db.flush()

    return synced_count


async def sync_google_source(db: AsyncSession, source: CalendarSource) -> int:
    """
    Fetch events from Google Calendar API and upsert them into cached_events.
    Returns the number of events synced.
    """
    if not source.google_access_token:
        return 0

    # Check if token needs refresh
    access_token = source.google_access_token
    if (
        source.google_token_expires_at
        and source.google_token_expires_at <= datetime.now(timezone.utc)
    ):
        access_token = await _refresh_google_token(db, source)
        if not access_token:
            return 0

    calendar_id = source.google_calendar_id or "primary"

    # Fetch events from now to 60 days in the future
    now = datetime.now(timezone.utc)
    time_min = now.isoformat()
    time_max = (now + timedelta(days=60)).isoformat()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": "2500",
            },
        )
        if resp.status_code == 401:
            # Token expired, try to refresh
            access_token = await _refresh_google_token(db, source)
            if not access_token:
                return 0
            resp = await client.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": "2500",
                },
            )
        resp.raise_for_status()
        data = resp.json()

    # Delete existing cached events for this source
    await db.execute(
        delete(CachedEvent).where(CachedEvent.calendar_source_id == source.id)
    )

    synced_count = 0
    for item in data.get("items", []):
        if item.get("status") == "cancelled":
            continue

        start = item.get("start", {})
        end = item.get("end", {})

        is_all_day = "date" in start and "dateTime" not in start

        if is_all_day:
            starts_at = datetime.combine(
                datetime.fromisoformat(start["date"]).date(),
                datetime.min.time(),
                tzinfo=timezone.utc,
            )
            ends_at = datetime.combine(
                datetime.fromisoformat(end["date"]).date(),
                datetime.min.time(),
                tzinfo=timezone.utc,
            )
        else:
            starts_at = datetime.fromisoformat(start["dateTime"])
            ends_at = datetime.fromisoformat(end["dateTime"])
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=timezone.utc)
            if ends_at.tzinfo is None:
                ends_at = ends_at.replace(tzinfo=timezone.utc)

        event = CachedEvent(
            id=uuid.uuid4(),
            calendar_source_id=source.id,
            user_id=source.user_id,
            title=(item.get("summary", "") or "")[:500] or None,
            starts_at=starts_at,
            ends_at=ends_at,
            is_all_day=is_all_day,
            external_id=(item.get("id", "") or "")[:500] or None,
        )
        db.add(event)
        synced_count += 1

    source.last_synced_at = datetime.now(timezone.utc)
    await db.flush()

    return synced_count


async def _refresh_google_token(
    db: AsyncSession, source: CalendarSource
) -> str | None:
    """Refresh the Google OAuth access token using the refresh token."""
    if not source.google_refresh_token:
        return None

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": source.google_refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if resp.status_code != 200:
            return None
        data = resp.json()

    source.google_access_token = data["access_token"]
    source.google_token_expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=data.get("expires_in", 3600)
    )
    await db.flush()

    return data["access_token"]


async def sync_calendar_source(db: AsyncSession, source: CalendarSource) -> int:
    """Sync a calendar source based on its type."""
    if source.type == "ics_url":
        return await sync_ics_source(db, source)
    elif source.type == "google":
        return await sync_google_source(db, source)
    return 0
