from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.models.booking import Booking
from sqlalchemy import func, and_

router = APIRouter(tags=["users"])


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    name: Optional[str]
    timezone: str
    image_url: Optional[str]

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    username: Optional[str] = None
    timezone: Optional[str] = None


class DashboardStats(BaseModel):
    upcoming_bookings: int
    total_event_types: int


@router.get("/api/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
):
    return user


@router.patch("/api/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.username is not None:
        # Validate username format
        if not re.match(r'^[a-zA-Z0-9_-]+$', payload.username):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username can only contain letters, numbers, hyphens, and underscores",
            )
        # Check uniqueness
        result = await db.execute(
            select(User).where(
                User.username == payload.username.lower(),
                User.id != user.id,
            )
        )
        if result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username is already taken",
            )
        user.username = payload.username.lower()

    if payload.timezone is not None:
        user.timezone = payload.timezone

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/api/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Count upcoming confirmed bookings
    now = datetime.now(timezone.utc)
    upcoming_result = await db.execute(
        select(func.count(Booking.id)).where(
            and_(
                Booking.host_user_id == user.id,
                Booking.status == "confirmed",
                Booking.starts_at > now,
            )
        )
    )
    upcoming_count = upcoming_result.scalar() or 0

    # Count active event types
    et_result = await db.execute(
        select(func.count(EventType.id)).where(
            and_(
                EventType.user_id == user.id,
                EventType.is_active.is_(True),
            )
        )
    )
    et_count = et_result.scalar() or 0

    return DashboardStats(
        upcoming_bookings=upcoming_count,
        total_event_types=et_count,
    )
