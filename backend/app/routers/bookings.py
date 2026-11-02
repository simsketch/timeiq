from __future__ import annotations

import hashlib
import hmac
import ipaddress
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
import stripe
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingPublicResponse, BookingResponse, HostBookingCreate, HostReschedule
from app.services.availability import (
    booking_window_error,
    find_conflicts,
    freshen_host_calendars,
    is_bookable,
)
from app.services.email import send_booking_confirmation, send_cancellation_notice
from app.services.ics_generator import ical_uid_for
from app.services import billing
from app.services import booking_payments as payments
from app.services import push
from app.services.booking_lock import lock_host_bookings


def require_visitor_fields(event_type: EventType, payload) -> None:
    """Enforce the event type's required visitor fields, which the form only hints at."""
    required = {
        "visitor_phone": ("phone number", event_type.require_phone),
        "visitor_company": ("company", event_type.require_company),
        "visitor_url": ("website", event_type.require_url),
    }
    for field, (label, needed) in required.items():
        if needed and not (getattr(payload, field, None) or "").strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"A {label} is required for this booking",
            )


# Per hour. The visitor's email is caller-supplied, so a fresh address per
# request gets past its limit; these hold regardless of the address given.
MAX_BOOKINGS_PER_SOURCE = 10
MAX_BOOKINGS_PER_HOST = 30


def source_ip_hash(request: Request | None) -> str | None:
    """A keyed hash of the ASGI peer address (never a caller-supplied
    forwarding header), so the limit doesn't store raw addresses. Loopback
    (local dev, tests) has no source limit rather than one shared by all."""
    host = request.client.host if request is not None and request.client else None
    try:
        if not host or ipaddress.ip_address(host).is_loopback:
            return None
    except ValueError:
        pass
    key = (settings.CRON_SECRET or settings.CLERK_SECRET_KEY or "timeiq").encode()
    return hmac.new(key, host.encode(), hashlib.sha256).hexdigest()


async def limit_booking_sources(db: AsyncSession, host: User, ip_hash: str | None) -> None:
    """Cap public bookings per network source (across hosts) and per host.
    Run under the host lock; the source lock covers other hosts' requests."""
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    for_host = await db.scalar(select(func.count(Booking.id)).where(
        Booking.host_user_id == host.id, Booking.created_at > since,
    ))
    if (for_host or 0) >= MAX_BOOKINGS_PER_HOST:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="This calendar is taking a lot of bookings right now. Try again in an hour.",
        )
    if ip_hash is None:
        return
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"timeiq-booking-source:{ip_hash}"},
    )
    from_source = await db.scalar(select(func.count(Booking.id)).where(
        Booking.source_ip_hash == ip_hash, Booking.created_at > since,
    ))
    if (from_source or 0) >= MAX_BOOKINGS_PER_SOURCE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many bookings from your network in the past hour. Try again in an hour.",
        )


async def limit_booking_emails(db: AsyncSession, host: User, payload: BookingCreate) -> None:
    """Run under the host lock so concurrent requests share the same quota."""
    recent = await db.scalar(
        select(func.count(Booking.id)).where(
            Booking.host_user_id == host.id,
            func.lower(Booking.visitor_email) == str(payload.visitor_email).lower(),
            Booking.created_at > datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    if (recent or 0) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many bookings for this email in the past hour. Try again in an hour.",
        )


def _requested_window(payload: BookingCreate, event_type: EventType) -> tuple[datetime, datetime]:
    """The requested start and end in UTC, after the checks that need no database.
    The end is start + duration in elapsed time, matching the offered slots."""
    starts_at = payload.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    starts_at = starts_at.astimezone(timezone.utc)

    error = booking_window_error(event_type, starts_at, datetime.now(timezone.utc))
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )
    require_visitor_fields(event_type, payload)
    return starts_at, starts_at + timedelta(minutes=event_type.duration_minutes)


def _booking_from_payload(payload: BookingCreate, event_type: EventType, host: User, starts_at: datetime, ends_at: datetime, **extra) -> Booking:
    return Booking(
        event_type_id=event_type.id,
        host_user_id=host.id,
        visitor_name=payload.visitor_name,
        visitor_email=payload.visitor_email,
        visitor_notes=payload.visitor_notes,
        visitor_phone=payload.visitor_phone,
        visitor_company=payload.visitor_company,
        visitor_url=payload.visitor_url,
        starts_at=starts_at,
        ends_at=ends_at,
        timezone=payload.timezone,
        status="confirmed",
        cancel_token=secrets.token_urlsafe(32),
        **extra,
    )


_cancel = payments.mark_cancelled


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
        .order_by(Booking.starts_at.asc())
    )
    if status_filter:
        query = query.where(Booking.status == status_filter)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/api/bookings", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking_as_host(
    payload: HostBookingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Book a meeting by hand. The host can pick any future time, outside their
    availability or booking window; overlaps are refused unless allow_conflict.
    No payment is taken. The guest gets the usual confirmation and invite."""
    event_type = (await db.execute(
        select(EventType).where(EventType.id == payload.event_type_id, EventType.user_id == user.id)
    )).scalar_one_or_none()
    if event_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")

    starts_at = payload.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    starts_at = starts_at.astimezone(timezone.utc)
    if starts_at < datetime.now(timezone.utc) - timedelta(minutes=5):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pick a time that hasn't passed yet")
    ends_at = starts_at + timedelta(minutes=payload.duration_minutes or event_type.duration_minutes)

    # Sync calendars first: it can take seconds and must not hold the lock.
    await freshen_host_calendars(user)
    await lock_host_bookings(db, user.id)
    if not payload.allow_conflict:
        conflicts = await find_conflicts(db, user, starts_at, ends_at)
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time overlaps: " + ", ".join(conflicts[:3]) + (f" and {len(conflicts) - 3} more" if len(conflicts) > 3 else ""),
            )

    booking_id = uuid.uuid4()
    booking = Booking(
        id=booking_id,
        event_type_id=event_type.id,
        host_user_id=user.id,
        visitor_name=payload.visitor_name,
        visitor_email=payload.visitor_email,
        visitor_notes=payload.visitor_notes,
        guest_emails=list(dict.fromkeys(
            str(e) for e in payload.guest_emails if str(e).lower() != str(payload.visitor_email).lower()
        )),
        starts_at=starts_at,
        ends_at=ends_at,
        timezone=payload.timezone,
        status="confirmed",
        cancel_token=secrets.token_urlsafe(32),
        ical_uid=f"{booking_id}@timeiq.app",
        ical_sequence=0,
    )
    db.add(booking)
    await db.flush()
    await db.refresh(booking)
    await db.commit()
    await send_booking_confirmation(booking, event_type, user)
    await billing.note_meeting_booked(db, user)
    return booking


@router.post("/api/bookings/{booking_id}/reschedule", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def reschedule_booking_as_host(
    booking_id: uuid.UUID,
    payload: HostReschedule,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Move a booking to a new start, e.g. by dragging it on the calendar. Like a
    host booking, any future time is allowed and overlaps need allow_conflict.
    The new booking keeps the invite's UID with a higher SEQUENCE, so guests'
    calendars move the event."""
    starts_at = payload.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    starts_at = starts_at.astimezone(timezone.utc)
    if starts_at < datetime.now(timezone.utc) - timedelta(minutes=5):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pick a time that hasn't passed yet")

    await freshen_host_calendars(user)
    await lock_host_bookings(db, user.id)
    old = (await db.execute(
        select(Booking)
        .where(Booking.id == booking_id, Booking.host_user_id == user.id)
        .with_for_update()
    )).scalar_one_or_none()
    if old is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if old.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only confirmed bookings can be moved")
    if old.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This booking has already started and can't be moved")
    event_type = (await db.execute(select(EventType).where(EventType.id == old.event_type_id))).scalar_one_or_none()
    if event_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")

    ends_at = starts_at + (old.ends_at - old.starts_at)
    if not payload.allow_conflict:
        conflicts = await find_conflicts(db, user, starts_at, ends_at, exclude_booking_id=old.id)
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time overlaps: " + ", ".join(conflicts[:3]) + (f" and {len(conflicts) - 3} more" if len(conflicts) > 3 else ""),
            )

    old.status = "rescheduled" if old.price_cents is not None else "cancelled"
    old.cancelled_at = datetime.now(timezone.utc)

    from app.services.booking_agent import confirmation_id

    new_id = uuid.uuid4()
    new = Booking(
        id=new_id,
        event_type_id=old.event_type_id,
        host_user_id=user.id,
        visitor_name=old.visitor_name,
        visitor_email=old.visitor_email,
        visitor_notes=old.visitor_notes,
        visitor_phone=old.visitor_phone,
        visitor_company=old.visitor_company,
        visitor_url=old.visitor_url,
        guest_emails=list(old.guest_emails or []),
        starts_at=starts_at,
        ends_at=ends_at,
        timezone=old.timezone,
        status="confirmed",
        cancel_token=secrets.token_urlsafe(32),
        rescheduled_from_id=old.id,
        ical_uid=ical_uid_for(old),
        ical_sequence=(old.ical_sequence or 0) + 1,
        price_cents=old.price_cents,
        currency=old.currency,
        stripe_connect_account_id=old.stripe_connect_account_id,
        stripe_payment_intent_id=old.stripe_payment_intent_id,
        email_thread_ids=[*(old.email_thread_ids or []), confirmation_id(old, "host"), confirmation_id(old, "guest")][-100:],
    )
    db.add(new)
    await db.flush()
    await db.refresh(new)
    await db.commit()
    await send_booking_confirmation(new, event_type, user)
    return new


@router.patch("/api/bookings/{booking_id}", response_model=BookingResponse)
async def cancel_booking_as_host(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a booking as the host."""
    result = await db.execute(
        select(Booking)
        .where(
            Booking.id == booking_id,
            Booking.host_user_id == user.id,
        )
        .with_for_update()
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status not in ("confirmed", "pending_payment"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is already cancelled",
        )

    was_confirmed = booking.status == "confirmed"
    await payments.cancel_payment(booking, as_host=True)
    _cancel(booking)
    await db.flush()
    await db.refresh(booking)

    # Load event type for email
    et_result = await db.execute(
        select(EventType).where(EventType.id == booking.event_type_id)
    )
    event_type = et_result.scalar_one_or_none()
    await db.commit()
    if event_type and was_confirmed:
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
    request: Request = None,  # FastAPI injects it; None when called in-process
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

    starts_at, ends_at = _requested_window(payload, event_type)
    payments.require_payments(host, event_type)
    if event_type.price_cents is not None:
        try:
            await payments.refresh_account(host)
        except stripe.StripeError:
            raise HTTPException(status_code=502, detail="Stripe could not check the host's account. Try booking again shortly.")
        payments.require_payments(host, event_type)

    # Sync calendars first: it can take seconds and must not hold the lock.
    await freshen_host_calendars(host)
    await payments.expire_holds(db, host.id)
    await payments.limit_booking_emails(db, payload.visitor_email)
    await lock_host_bookings(db, host.id)
    starts_at, ends_at = _requested_window(payload, event_type)
    await limit_booking_emails(db, host, payload)
    if await billing.free_meetings_left(db, host) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This calendar isn't taking new bookings right now.",
        )
    ip_hash = source_ip_hash(request)
    await limit_booking_sources(db, host, ip_hash)
    if not await is_bookable(db, host, event_type, starts_at, freshen=False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This time slot is no longer available",
        )

    booking_id = uuid.uuid4()
    booking = _booking_from_payload(
        payload, event_type, host, starts_at, ends_at,
        id=booking_id,
        ical_uid=f"{booking_id}@timeiq.app",
        ical_sequence=0,
        source_ip_hash=ip_hash,
    )
    db.add(booking)
    if event_type.price_cents is not None:
        try:
            await payments.create_checkout(booking, event_type, host)
        except stripe.StripeError:
            raise HTTPException(status_code=502, detail="Stripe could not start checkout. Try booking again shortly.")
    await db.flush()
    await db.refresh(booking)
    # Commit (releasing the host lock) before mail goes out, so a guest is never
    # told about a booking that then fails to save.
    await db.commit()

    # Send confirmation emails synchronously (serverless has no background tasks)
    if booking.status == "confirmed":
        await send_booking_confirmation(booking, event_type, host)
        await push.booking_event("booked", booking, event_type, host)
        await billing.note_meeting_booked(db, host)

    return booking


@router.get("/api/public/bookings/{booking_id}")
async def get_booking_for_reschedule(
    booking_id: uuid.UUID,
    token: str = Query(..., description="Cancellation token"),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: Get booking details for rescheduling."""
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
            detail="Booking not found",
        )

    # Load event type and host to build the reschedule URL info
    et_result = await db.execute(
        select(EventType).where(EventType.id == booking.event_type_id)
    )
    event_type = et_result.scalar_one_or_none()
    host_result = await db.execute(
        select(User).where(User.id == booking.host_user_id)
    )
    host = host_result.scalar_one_or_none()

    return {
        "id": str(booking.id),
        "visitor_name": booking.visitor_name,
        "visitor_email": booking.visitor_email,
        "visitor_notes": booking.visitor_notes,
        "visitor_phone": booking.visitor_phone,
        "visitor_company": booking.visitor_company,
        "visitor_url": booking.visitor_url,
        "starts_at": booking.starts_at.isoformat(),
        "ends_at": booking.ends_at.isoformat(),
        "status": booking.status,
        "event_slug": event_type.slug if event_type else None,
        "username": host.username if host else None,
        "event_type_name": event_type.name if event_type else None,
        "duration_minutes": event_type.duration_minutes if event_type else None,
        "price_cents": booking.price_cents,
        "currency": booking.currency,
        "refund_status": booking.refund_status,
        "refund_eligible": payments.refund_due(booking, as_host=False),
        "refund_policy": payments.REFUND_POLICY if booking.price_cents is not None else None,
    }


@router.post(
    "/api/public/bookings/{booking_id}/reschedule",
    response_model=BookingPublicResponse,
    status_code=status.HTTP_201_CREATED,
)
async def reschedule_booking(
    booking_id: uuid.UUID,
    payload: BookingCreate,
    token: str = Query(..., description="Cancellation token"),
    db: AsyncSession = Depends(get_db),
    request: Request = None,  # FastAPI injects it; None for the email agent
):
    """
    Public endpoint: Reschedule a booking — cancels the old one and creates a new one.
    Uses the same cancel_token for auth. The new booking keeps the original
    invite's UID with a higher SEQUENCE, so calendars move the existing event.
    """
    # Find the original booking
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.cancel_token == token,
        )
    )
    old_booking = result.scalar_one_or_none()
    if old_booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found or invalid token",
        )

    if old_booking.status != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only confirmed bookings can be rescheduled",
        )

    # Load event type and host
    et_result = await db.execute(
        select(EventType).where(EventType.id == old_booking.event_type_id)
    )
    event_type = et_result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    host_result = await db.execute(
        select(User).where(User.id == old_booking.host_user_id)
    )
    host = host_result.scalar_one_or_none()
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )

    starts_at, ends_at = _requested_window(payload, event_type)

    await freshen_host_calendars(host)
    await payments.expire_holds(db, host.id)
    await payments.limit_booking_emails(db, payload.visitor_email)
    await lock_host_bookings(db, host.id)
    starts_at, ends_at = _requested_window(payload, event_type)
    await limit_booking_emails(db, host, payload)
    ip_hash = source_ip_hash(request)
    await limit_booking_sources(db, host, ip_hash)

    # Re-read the original under a row lock: a concurrent reschedule or cancel
    # that committed while we waited has already used it up.
    locked = await db.execute(
        select(Booking)
        .where(Booking.id == old_booking.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    old_booking = locked.scalar_one()
    if old_booking.status != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only confirmed bookings can be rescheduled",
        )
    # A meeting that has started is used: moving it forward would also move
    # its payment back inside the guest refund window.
    if old_booking.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking has already started and can't be rescheduled",
        )

    if not await is_bookable(
        db, host, event_type, starts_at, exclude_booking_id=old_booking.id, freshen=False
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This time slot is no longer available",
        )

    # Cancel the old booking. Its guest gets no CANCEL: the new booking's
    # REQUEST carries the same UID and replaces the event.
    old_booking.status = "rescheduled" if old_booking.price_cents is not None else "cancelled"
    old_booking.cancelled_at = datetime.now(timezone.utc)

    from app.services.booking_agent import confirmation_id

    new_booking = _booking_from_payload(
        payload, event_type, host, starts_at, ends_at,
        rescheduled_from_id=old_booking.id,
        source_ip_hash=ip_hash,
        ical_uid=ical_uid_for(old_booking),
        ical_sequence=(old_booking.ical_sequence or 0) + 1,
        price_cents=old_booking.price_cents,
        currency=old_booking.currency,
        stripe_connect_account_id=old_booking.stripe_connect_account_id,
        stripe_payment_intent_id=old_booking.stripe_payment_intent_id,
        guest_emails=list(old_booking.guest_emails or []),
        email_thread_ids=[*(old_booking.email_thread_ids or []), confirmation_id(old_booking, "host"), confirmation_id(old_booking, "guest")][-100:],
    )
    db.add(new_booking)
    await db.flush()
    await db.refresh(new_booking)
    await db.commit()

    # Send confirmation for the new booking
    await send_booking_confirmation(new_booking, event_type, host)
    await push.booking_event("rescheduled", new_booking, event_type, host)

    return new_booking


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
        select(Booking)
        .where(
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

    if booking.status not in ("confirmed", "pending_payment"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is already cancelled",
        )

    # Match reschedule's lock order: email first, then the booking row.
    await payments.limit_booking_emails(db, booking.visitor_email, cancellation=True)
    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.cancel_token == token)
        .with_for_update().execution_options(populate_existing=True)
    )).scalar_one()
    if booking.status not in ("confirmed", "pending_payment"):
        raise HTTPException(status_code=400, detail="Booking is already cancelled")

    was_confirmed = booking.status == "confirmed"
    await payments.cancel_payment(booking, as_host=False)
    _cancel(booking)
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
    await db.commit()

    if event_type and host and was_confirmed:
        await send_cancellation_notice(booking, event_type, host)
        await push.booking_event("cancelled", booking, event_type, host)

    return booking
