from __future__ import annotations

import uuid

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.schemas.calendar import (
    CachedEventResponse,
    CalendarSourceCreate,
    CalendarSourceResponse,
    CalendarSourceUpdate,
)
from app.services.calendar_health import CalendarSyncError, classify, record_failure, record_success
from app.services.calendar_sync import fetch_ics, sync_calendar_source
from app.tasks import sync_source

router = APIRouter(prefix="/api/calendars", tags=["calendars"])


@router.get("", response_model=list[CalendarSourceResponse])
async def list_calendar_sources(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all calendar sources for the authenticated user."""
    result = await db.execute(
        select(CalendarSource)
        .where(CalendarSource.user_id == user.id)
        .order_by(CalendarSource.created_at.desc())
    )
    return result.scalars().all()


async def _check_ics_link(ics_url: str) -> None:
    """Refuse a link that doesn't return a readable calendar, saying why."""
    try:
        await fetch_ics(ics_url)
    except CalendarSyncError as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err.message)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=classify(exc).message)


async def _sync_in_request(db: AsyncSession, source: CalendarSource) -> None:
    """First sync of a just-saved source, inside the request's transaction."""
    now = datetime.now(timezone.utc)
    try:
        await sync_calendar_source(db, source)
        record_success(source, now)
    except Exception as exc:
        record_failure(source, classify(exc), now)
    await db.flush()
    await db.refresh(source)


async def _create_ics_calendar(
    payload: CalendarSourceCreate,
    user: User,
    db: AsyncSession,
) -> CalendarSource:
    """Shared logic for creating an ICS calendar source."""
    await _check_ics_link(payload.ics_url)
    source = CalendarSource(
        user_id=user.id,
        type="ics_url",
        name=payload.name,
        ics_url=payload.ics_url.strip(),
        is_active=True,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)
    await _sync_in_request(db, source)
    return source


async def _get_own_source(db: AsyncSession, user: User, source_id: uuid.UUID) -> CalendarSource:
    source = (
        await db.execute(
            select(CalendarSource).where(CalendarSource.id == source_id, CalendarSource.user_id == user.id)
        )
    ).scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar source not found")
    return source


@router.patch("/{source_id}", response_model=CalendarSourceResponse)
async def update_calendar_source(
    source_id: uuid.UUID,
    payload: CalendarSourceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a calendar or replace its ICS link. A new link is checked, then synced."""
    source = await _get_own_source(db, user, source_id)
    if payload.name is not None:
        source.name = payload.name.strip() or source.name
    if payload.ics_url is not None and payload.ics_url.strip() != (source.ics_url or ""):
        if source.type != "ics_url":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only ICS calendars have a link to replace")
        await _check_ics_link(payload.ics_url)
        source.ics_url = payload.ics_url.strip()
        source.is_active = True
        await _sync_in_request(db, source)
    await db.flush()
    await db.refresh(source)
    return source


@router.post(
    "",
    response_model=CalendarSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_calendar(
    payload: CalendarSourceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a calendar source (accepts POST to /api/calendars)."""
    return await _create_ics_calendar(payload, user, db)


@router.post(
    "/ics",
    response_model=CalendarSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_ics_calendar(
    payload: CalendarSourceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add an ICS URL calendar source and immediately sync it (legacy endpoint)."""
    return await _create_ics_calendar(payload, user, db)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_source(
    source_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a calendar source and its cached events."""
    result = await db.execute(
        select(CalendarSource).where(
            CalendarSource.id == source_id,
            CalendarSource.user_id == user.id,
        )
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar source not found",
        )

    await db.delete(source)
    await db.flush()


@router.get("/cached-events", response_model=list[CachedEventResponse])
async def list_cached_events(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, ge=1, le=90),
):
    """List cached calendar events for the next N days (default 30)."""
    now = datetime.now(timezone.utc)
    window_end = datetime(
        now.year, now.month, now.day, tzinfo=timezone.utc
    ) + timedelta(days=days)

    result = await db.execute(
        select(CachedEvent)
        .where(
            CachedEvent.user_id == user.id,
            CachedEvent.ends_at > now,
            CachedEvent.starts_at < window_end,
        )
        .options(selectinload(CachedEvent.calendar_source))
        .order_by(CachedEvent.starts_at.asc())
    )
    events = result.scalars().all()

    return [
        CachedEventResponse(
            id=e.id,
            calendar_source_id=e.calendar_source_id,
            title=e.title,
            starts_at=e.starts_at,
            ends_at=e.ends_at,
            is_all_day=e.is_all_day,
            source_name=e.calendar_source.name if e.calendar_source else None,
        )
        for e in events
    ]


@router.post("/sync-all")
async def sync_all_calendars(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a manual sync of all active calendar sources for the user."""
    result = await db.execute(
        select(CalendarSource.id).where(
            CalendarSource.user_id == user.id,
            CalendarSource.is_active.is_(True),
        )
    )
    outcomes = [await sync_source(sid, force=True) for sid in result.scalars().all()]
    return {"synced": outcomes.count("synced"), "failed": outcomes.count("failed")}


@router.post("/{source_id}/sync", response_model=CalendarSourceResponse)
async def sync_calendar(
    source_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a manual sync of a calendar source."""
    result = await db.execute(
        select(CalendarSource).where(
            CalendarSource.id == source_id,
            CalendarSource.user_id == user.id,
        )
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar source not found",
        )

    if not source.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calendar source is not active",
        )

    outcome = await sync_source(source.id, force=True)
    await db.refresh(source)
    if outcome == "failed":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=source.last_sync_error or "Failed to sync calendar",
        )
    return source
