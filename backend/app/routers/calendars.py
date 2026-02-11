from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.schemas.calendar import CalendarSourceCreate, CalendarSourceResponse
from app.services.calendar_sync import sync_calendar_source

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


async def _create_ics_calendar(
    payload: CalendarSourceCreate,
    user: User,
    db: AsyncSession,
) -> CalendarSource:
    """Shared logic for creating an ICS calendar source."""
    source = CalendarSource(
        user_id=user.id,
        type="ics_url",
        name=payload.name,
        ics_url=payload.ics_url,
        is_active=True,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)

    # Immediately sync the calendar
    try:
        await sync_calendar_source(db, source)
        await db.refresh(source)
    except Exception:
        # Don't fail the creation if sync fails
        pass

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


@router.post("/sync-all")
async def sync_all_calendars(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a manual sync of all active calendar sources for the user."""
    result = await db.execute(
        select(CalendarSource).where(
            CalendarSource.user_id == user.id,
            CalendarSource.is_active.is_(True),
        )
    )
    sources = result.scalars().all()

    synced = 0
    failed = 0
    for source in sources:
        try:
            await sync_calendar_source(db, source)
            synced += 1
        except Exception:
            failed += 1

    return {"synced": synced, "failed": failed}


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

    try:
        count = await sync_calendar_source(db, source)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync calendar: {str(e)}",
        )

    await db.refresh(source)
    return source
