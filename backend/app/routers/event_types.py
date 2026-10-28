from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.event_type import (
    INTAKE_FIELDS,
    EventTypeCreate,
    EventTypeResponse,
    EventTypeUpdate,
)

router = APIRouter(prefix="/api/event-types", tags=["event-types"])


def _slugify(name: str) -> str:
    """Generate a URL-friendly slug from a name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug or "event"


@router.get("", response_model=list[EventTypeResponse])
async def list_event_types(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all event types for the authenticated user."""
    result = await db.execute(
        select(EventType)
        .where(EventType.user_id == user.id, EventType.archived_at.is_(None))
        .order_by(EventType.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=EventTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_event_type(
    payload: EventTypeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new event type. Slug is auto-generated from the name."""
    base_slug = _slugify(payload.name)
    slug = base_slug

    # Ensure uniqueness of slug for this user
    suffix = 0
    while True:
        result = await db.execute(
            select(EventType).where(
                EventType.user_id == user.id,
                EventType.slug == slug,
            )
        )
        if result.scalar_one_or_none() is None:
            break
        suffix += 1
        slug = f"{base_slug}-{suffix}"

    event_type = EventType(
        user_id=user.id,
        slug=slug,
        name=payload.name,
        description=payload.description,
        location=payload.location,
        duration_minutes=payload.duration_minutes,
        color=payload.color,
        is_active=payload.is_active,
        buffer_minutes=payload.buffer_minutes,
        max_bookings_per_day=payload.max_bookings_per_day,
        min_notice_minutes=payload.min_notice_minutes,
        max_days_ahead=payload.max_days_ahead,
        reminder_minutes=sorted(set(payload.reminder_minutes)),
        remind_host=payload.remind_host,
        **payload.intake_flags(),
    )
    db.add(event_type)
    await db.flush()
    await db.refresh(event_type)
    return event_type


def _normalize_intake(event_type: EventType, update_data: dict) -> None:
    """Keep require => collect true for the state this update produces. When the
    update turns collection off on its own, stop requiring that field; otherwise
    requiring a field turns its collection on."""
    for f in INTAKE_FIELDS:
        c, r = f"collect_{f}", f"require_{f}"
        collect = update_data.get(c, getattr(event_type, c))
        require = update_data.get(r, getattr(event_type, r))
        if require and not collect:
            if c in update_data and r not in update_data:
                update_data[r] = False
            else:
                update_data[c] = True


async def _do_update_event_type(
    event_type_id: uuid.UUID,
    payload: EventTypeUpdate,
    user: User,
    db: AsyncSession,
) -> EventType:
    """Shared logic for PATCH and PUT update endpoints."""
    result = await db.execute(
        select(EventType).where(
            EventType.id == event_type_id,
            EventType.user_id == user.id,
            EventType.archived_at.is_(None),
        )
    )
    event_type = result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Use by_alias=False so we get the actual field names (duration_minutes, buffer_minutes)
    # which match the SQLAlchemy model column names.
    update_data = payload.model_dump(exclude_unset=True, by_alias=False)
    if "reminder_minutes" in update_data:
        update_data["reminder_minutes"] = sorted(set(update_data["reminder_minutes"]))

    # If name is being updated but slug is not, regenerate slug
    if "name" in update_data and "slug" not in update_data:
        base_slug = _slugify(update_data["name"])
        slug = base_slug
        suffix = 0
        while True:
            result = await db.execute(
                select(EventType).where(
                    EventType.user_id == user.id,
                    EventType.slug == slug,
                    EventType.id != event_type.id,
                )
            )
            if result.scalar_one_or_none() is None:
                break
            suffix += 1
            slug = f"{base_slug}-{suffix}"
        update_data["slug"] = slug
    elif "slug" in update_data:
        # Verify uniqueness of the provided slug
        new_slug = _slugify(update_data["slug"])
        result = await db.execute(
            select(EventType).where(
                EventType.user_id == user.id,
                EventType.slug == new_slug,
                EventType.id != event_type.id,
            )
        )
        if result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Slug already in use",
            )
        update_data["slug"] = new_slug

    _normalize_intake(event_type, update_data)
    for field, value in update_data.items():
        setattr(event_type, field, value)

    event_type.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(event_type)
    return event_type


@router.patch("/{event_type_id}", response_model=EventTypeResponse)
async def update_event_type(
    event_type_id: uuid.UUID,
    payload: EventTypeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing event type (partial update)."""
    return await _do_update_event_type(event_type_id, payload, user, db)


@router.put("/{event_type_id}", response_model=EventTypeResponse)
async def replace_event_type(
    event_type_id: uuid.UUID,
    payload: EventTypeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing event type (full replacement - accepts same partial body)."""
    return await _do_update_event_type(event_type_id, payload, user, db)


@router.delete("/{event_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_type(
    event_type_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an event type.

    Refused while it has upcoming confirmed bookings, since those guests still
    expect to meet. With only past or cancelled bookings it is archived: hidden
    everywhere, its slug freed, its booking history kept. Without any bookings
    it is deleted outright."""
    result = await db.execute(
        select(EventType).where(
            EventType.id == event_type_id,
            EventType.user_id == user.id,
            EventType.archived_at.is_(None),
        )
    )
    event_type = result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    now = datetime.now(timezone.utc)
    upcoming = await db.scalar(
        select(exists().where(
            Booking.event_type_id == event_type.id,
            Booking.status == "confirmed",
            Booking.ends_at > now,
        ))
    )
    if upcoming:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This event type has upcoming bookings, so it can't be deleted. "
                "Turn it off to stop new bookings, or cancel those bookings first."
            ),
        )

    has_history = await db.scalar(
        select(exists().where(Booking.event_type_id == event_type.id))
    )
    if has_history:
        event_type.archived_at = now
        event_type.is_active = False
        # Free the slug for a new event type; the unique constraint still covers archived rows.
        event_type.slug = f"{event_type.slug[:160]}-archived-{uuid.uuid4().hex[:8]}"
        event_type.updated_at = now
    else:
        await db.delete(event_type)
    await db.flush()
