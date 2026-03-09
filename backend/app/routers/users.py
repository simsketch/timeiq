from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.auth import get_current_user, get_current_user_clerk_id
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.models.booking import Booking
from sqlalchemy import func, and_

logger = logging.getLogger(__name__)

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
    name: Optional[str] = None
    username: Optional[str] = None
    timezone: Optional[str] = None


class DashboardStats(BaseModel):
    upcoming_bookings: int
    total_event_types: int


def _derive_username(email: str) -> str:
    """Derive a username from an email address."""
    prefix = email.split("@")[0]
    username = re.sub(r"[^a-zA-Z0-9_-]", "", prefix).lower()
    return username or "user"


@router.post("/api/me/sync", response_model=UserResponse)
async def sync_current_user(
    clerk_id: str = Depends(get_current_user_clerk_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Ensure the current Clerk user exists in the database.
    Fetches user info from the Clerk API and creates/updates the local record.
    This is a fallback for when the Clerk webhook hasn't fired yet.
    """
    # Check if user already exists
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    # Fetch user details from Clerk API
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.clerk.com/v1/users/{clerk_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to fetch user from Clerk",
            )
        data = resp.json()

    # Extract user fields
    email_addresses = data.get("email_addresses", [])
    primary_email_id = data.get("primary_email_address_id")
    email = ""
    for ea in email_addresses:
        if ea.get("id") == primary_email_id:
            email = ea.get("email_address", "")
            break
    if not email and email_addresses:
        email = email_addresses[0].get("email_address", "")

    first_name = data.get("first_name") or ""
    last_name = data.get("last_name") or ""
    name = f"{first_name} {last_name}".strip() or None

    clerk_username = data.get("username")
    username = clerk_username.lower() if clerk_username else _derive_username(email)

    # Ensure unique username
    base = username
    suffix = 0
    while True:
        candidate = f"{base}{suffix}" if suffix > 0 else base
        existing = await db.execute(select(User).where(User.username == candidate))
        if existing.scalar_one_or_none() is None:
            username = candidate
            break
        suffix += 1

    user = User(
        clerk_id=clerk_id,
        email=email,
        name=name,
        username=username,
        image_url=data.get("image_url"),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    logger.info(f"Synced user {username} (clerk_id={clerk_id})")
    return user


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
    if payload.name is not None:
        user.name = payload.name.strip() or None

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
