from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user
from app.database import get_db
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingPublicResponse, BookingResponse
from app.services.email import send_booking_confirmation, send_cancellation_notice

router = APIRouter(tags=["bookings"])


@router.get("/api/bookings", response_model=list[BookingResponse])
async def list_bookings(
    status_filter: str | None = Query(
        default=None, alias="status", description="Filter by status"
    ),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all bookings for the authenticated host user."""
    query = (
        select(Booking)
        .where(Booking.host_user_id == user.id)
        .order_by(Booking.starts_at.desc())
    )
    if status_filter:
        query = query.where(Booking.status == status_filter)

    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/api/bookings/{booking_id}", response_model=BookingResponse)
async def cancel_booking_as_host(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a booking as the host."""
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.host_user_id == user.id,
        )
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is already cancelled",
        )

    booking.status = "cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(booking)

    # Load event type for email
    et_result = await db.execute(
        select(EventType).where(EventType.id == booking.event_type_id)
    )
    event_type = et_result.scalar_one_or_none()
    if event_type:
        await send_cancellation_notice(booking, event_type, user)

    return booking


@router.post(
    "/api/public/{username}/{event_slug}/book",
    response_model=BookingPublicResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_public_booking(
    username: str,
    event_slug: str,
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint: Create a booking for a host's event type.
    No authentication required.
    """
    # Look up the host
    result = await db.execute(
        select(User).where(User.username == username)
    )
    host = result.scalar_one_or_none()
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Look up the event type
    result = await db.execute(
        select(EventType).where(
            and_(
                EventType.user_id == host.id,
                EventType.slug == event_slug,
                EventType.is_active.is_(True),
            )
        )
    )
    event_type = result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Calculate end time
    starts_at = payload.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    ends_at = starts_at + timedelta(minutes=event_type.duration_minutes)

    # Verify the slot is not in the past
    if starts_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot book a slot in the past",
        )

    # Verify no conflicting confirmed bookings exist
    conflict_result = await db.execute(
        select(Booking).where(
            and_(
                Booking.host_user_id == host.id,
                Booking.status == "confirmed",
                Booking.starts_at < ends_at,
                Booking.ends_at > starts_at,
            )
        )
    )
    if conflict_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This time slot is no longer available",
        )

    # Create the booking
    cancel_token = secrets.token_urlsafe(32)

    booking = Booking(
        event_type_id=event_type.id,
        host_user_id=host.id,
        visitor_name=payload.visitor_name,
        visitor_email=payload.visitor_email,
        visitor_notes=payload.visitor_notes,
        starts_at=starts_at,
        ends_at=ends_at,
        timezone=payload.timezone,
        status="confirmed",
        cancel_token=cancel_token,
    )
    db.add(booking)
    await db.flush()
    await db.refresh(booking)

    # Send confirmation emails synchronously (serverless has no background tasks)
    await send_booking_confirmation(booking, event_type, host)

    return booking


@router.post(
    "/api/public/bookings/{booking_id}/cancel",
    response_model=BookingPublicResponse,
)
async def cancel_booking_by_visitor(
    booking_id: uuid.UUID,
    token: str = Query(..., description="Cancellation token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint: Cancel a booking using the cancellation token.
    No authentication required.
    """
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.cancel_token == token,
        )
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found or invalid cancellation token",
        )

    if booking.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is already cancelled",
        )

    booking.status = "cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(booking)

    # Load event type and host for email
    et_result = await db.execute(
        select(EventType).where(EventType.id == booking.event_type_id)
    )
    event_type = et_result.scalar_one_or_none()
    host_result = await db.execute(
        select(User).where(User.id == booking.host_user_id)
    )
    host = host_result.scalar_one_or_none()

    if event_type and host:
        await send_cancellation_notice(booking, event_type, host)

    return booking
