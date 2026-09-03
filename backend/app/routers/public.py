from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
import uuid

from app.database import get_db
from app.models.booking import Booking
from app.models.cached_event import CachedEvent
from app.models.event_type import EventType
from app.models.user import User
from app.services.ics_generator import generate_feed_ics

router = APIRouter(prefix="/api/public", tags=["public"])

# How much of the past / future to publish in the feed.
FEED_PAST_DAYS = 30
FEED_FUTURE_DAYS = 365


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
    collect_phone: bool = False
    require_phone: bool = False
    collect_company: bool = False
    require_company: bool = False
    collect_url: bool = False
    require_url: bool = False

    model_config = {"from_attributes": True}


@router.get("/feed/{token}.ics")
async def get_user_feed(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public ICS feed of a user's bookings and synced external events.

    Subscribe via webcal://... in Google/Apple Calendar. The token is the only
    credential; regenerate it to revoke access.
    """
    result = await db.execute(select(User).where(User.feed_token == token))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feed not found",
        )

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=FEED_PAST_DAYS)
    window_end = now + timedelta(days=FEED_FUTURE_DAYS)

    bookings_result = await db.execute(
        select(Booking)
        .where(
            and_(
                Booking.host_user_id == user.id,
                Booking.status == "confirmed",
                Booking.ends_at > window_start,
                Booking.starts_at < window_end,
            )
        )
        .options(selectinload(Booking.event_type))
        .order_by(Booking.starts_at.asc())
    )
    bookings = bookings_result.scalars().all()

    cached_result = await db.execute(
        select(CachedEvent)
        .where(
            and_(
                CachedEvent.user_id == user.id,
                CachedEvent.ends_at > window_start,
                CachedEvent.starts_at < window_end,
            )
        )
        .order_by(CachedEvent.starts_at.asc())
    )
    cached_events = cached_result.scalars().all()

    display_name = user.name or user.username
    ics = generate_feed_ics(
        calendar_name=f"{display_name} — TimeIQ",
        bookings=bookings,
        cached_events=cached_events,
        obfuscate=user.feed_obfuscate,
    )

    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'inline; filename="{user.username}.ics"',
            "Cache-Control": "public, max-age=900",
        },
    )


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


# ---------------------------------------------------------------------------
# Public invoice pages (token-addressed, no auth)
# ---------------------------------------------------------------------------

from app.models.invoice import Invoice  # noqa: E402
from app.schemas.invoice import InvoiceLineResponse, PublicInvoiceResponse  # noqa: E402
from app.services.invoice_pdf import build_invoice_pdf  # noqa: E402


async def _public_invoice(token: str, db: AsyncSession) -> tuple[Invoice, User]:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines), selectinload(Invoice.user))
        .where(Invoice.public_token == token)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None or invoice.status == "void":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    return invoice, invoice.user


@router.get("/invoices/{token}", response_model=PublicInvoiceResponse)
async def public_invoice(token: str, db: AsyncSession = Depends(get_db)):
    invoice, sender = await _public_invoice(token, db)
    return PublicInvoiceResponse(
        number=invoice.number,
        status=invoice.status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        period_start=invoice.period_start,
        period_end=invoice.period_end,
        currency=invoice.currency,
        hourly_rate=invoice.hourly_rate,
        subtotal=invoice.subtotal,
        client_name=invoice.client_name,
        client_contact_name=invoice.client_contact_name,
        client_billing_email=invoice.client_billing_email,
        client_address=invoice.client_address,
        notes=invoice.notes,
        sender_name=sender.name or sender.email,
        sender_email=sender.email,
        lines=[InvoiceLineResponse.model_validate(l) for l in invoice.lines],
    )


@router.get("/invoices/{token}/pdf")
async def public_invoice_pdf(token: str, db: AsyncSession = Depends(get_db)):
    invoice, sender = await _public_invoice(token, db)
    pdf = build_invoice_pdf(invoice, sender.name or sender.email, sender.email)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.number}.pdf"'},
    )
