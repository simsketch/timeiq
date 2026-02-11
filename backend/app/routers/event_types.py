from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.event_type import EventTypeCreate, EventTypeResponse, EventTypeUpdate

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
        .where(EventType.user_id == user.id)
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
        duration_minutes=payload.duration_minutes,
        color=payload.color,
        is_active=payload.is_active,
        buffer_minutes=payload.buffer_minutes,
        max_bookings_per_day=payload.max_bookings_per_day,
    )
    db.add(event_type)
    await db.flush()
    await db.refresh(event_type)
    return event_type


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
    """Delete an event type."""
    result = await db.execute(
        select(EventType).where(
            EventType.id == event_type_id,
            EventType.user_id == user.id,
        )
    )
    event_type = result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    await db.delete(event_type)
    await db.flush()
