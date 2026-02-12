from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import uuid

from app.database import get_db
from app.models.user import User
from app.models.event_type import EventType

router = APIRouter(prefix="/api/public", tags=["public"])


class PublicEventType(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    duration_minutes: int
    description: Optional[str]
    location: Optional[str]
    color: str

    model_config = {"from_attributes": True}


class PublicUserProfile(BaseModel):
    username: str
    name: Optional[str]
    image_url: Optional[str]
    event_types: list[PublicEventType]


class PublicEventTypeDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    duration_minutes: int
    description: Optional[str]
    location: Optional[str]
    color: str
    buffer_minutes: int
    host_name: Optional[str] = None

    model_config = {"from_attributes": True}


@router.get("/{username}", response_model=PublicUserProfile)
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's public profile with their active event types."""
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    et_result = await db.execute(
        select(EventType).where(
            and_(
                EventType.user_id == user.id,
                EventType.is_active.is_(True),
            )
        ).order_by(EventType.created_at)
    )
    event_types = et_result.scalars().all()

    return PublicUserProfile(
        username=user.username,
        name=user.name,
        image_url=user.image_url,
        event_types=[PublicEventType.model_validate(et) for et in event_types],
    )


@router.get("/{username}/{event_slug}", response_model=PublicEventTypeDetail)
async def get_public_event_type(
    username: str,
    event_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific event type's public details."""
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    et_result = await db.execute(
        select(EventType).where(
            and_(
                EventType.user_id == user.id,
                EventType.slug == event_slug,
                EventType.is_active.is_(True),
            )
        )
    )
    event_type = et_result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    detail = PublicEventTypeDetail.model_validate(event_type)
    detail.host_name = user.name
    return detail
