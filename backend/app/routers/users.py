from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import datetime, timezone

import csv
import io
import zipfile

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.auth import get_current_user_clerk_id
from app.auth import get_current_user_unrestricted as get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.models.booking import Booking
from app.services.email import send_welcome
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


class FeedSettings(BaseModel):
    url: str
    webcal_url: str
    obfuscate: bool


class FeedSettingsUpdate(BaseModel):
    obfuscate: bool


def _ensure_feed_token(user: User) -> str:
    if not user.feed_token:
        user.feed_token = secrets.token_urlsafe(32)
    return user.feed_token


def _build_feed_urls(request: Request, token: str) -> tuple[str, str]:
    base = str(request.base_url).rstrip("/")
    https_url = f"{base}/api/public/feed/{token}.ics"
    webcal_url = https_url.replace("https://", "webcal://").replace(
        "http://", "webcal://"
    )
    return https_url, webcal_url


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

    image_url = data.get("image_url")

    # Check if user already exists
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    if user is not None:
        # Only sync image from Clerk — name is user-configurable
        if image_url is not None:
            user.image_url = image_url
        user.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(user)
        logger.info(f"Re-synced user {user.username} (clerk_id={clerk_id})")
        return user

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
        image_url=image_url,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    logger.info(f"Synced user {username} (clerk_id={clerk_id})")
    send_welcome(user)
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


@router.get("/api/me/feed", response_model=FeedSettings)
async def get_feed_settings(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's ICS subscription URL and privacy setting.

    Lazily provisions a feed token the first time it's requested.
    """
    token = _ensure_feed_token(user)
    await db.flush()
    await db.refresh(user)
    https_url, webcal_url = _build_feed_urls(request, token)
    return FeedSettings(
        url=https_url,
        webcal_url=webcal_url,
        obfuscate=user.feed_obfuscate,
    )


@router.patch("/api/me/feed", response_model=FeedSettings)
async def update_feed_settings(
    payload: FeedSettingsUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle feed privacy (obfuscate event names)."""
    user.feed_obfuscate = payload.obfuscate
    token = _ensure_feed_token(user)
    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    https_url, webcal_url = _build_feed_urls(request, token)
    return FeedSettings(
        url=https_url,
        webcal_url=webcal_url,
        obfuscate=user.feed_obfuscate,
    )


@router.post("/api/me/feed/regenerate", response_model=FeedSettings)
async def regenerate_feed_token(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rotate the feed token — old subscription links stop working."""
    user.feed_token = secrets.token_urlsafe(32)
    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    https_url, webcal_url = _build_feed_urls(request, user.feed_token)
    return FeedSettings(
        url=https_url,
        webcal_url=webcal_url,
        obfuscate=user.feed_obfuscate,
    )


# ---------------------------------------------------------------------------
# Data export and account deletion (promised in the privacy policy)
# ---------------------------------------------------------------------------


def _csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return buf.getvalue()


@router.get("/api/me/export")
async def export_my_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Everything the user created, as a zip of CSVs plus a profile.json."""
    import json

    from app.models.client import Client
    from app.models.invoice import Invoice, InvoiceLine
    from app.models.time_entry import TimeEntry

    clients = (await db.execute(select(Client).where(Client.user_id == user.id).order_by(Client.name))).scalars().all()
    client_name = {c.id: c.name for c in clients}
    entries = (await db.execute(select(TimeEntry).where(TimeEntry.user_id == user.id).order_by(TimeEntry.entry_date))).scalars().all()
    invoices = (await db.execute(select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at))).scalars().all()
    inv_number = {i.id: i.number for i in invoices}
    lines = (await db.execute(select(InvoiceLine).where(InvoiceLine.invoice_id.in_([i.id for i in invoices])).order_by(InvoiceLine.line_date))).scalars().all() if invoices else []
    bookings = (await db.execute(select(Booking).where(Booking.host_user_id == user.id).order_by(Booking.starts_at))).scalars().all()
    event_types = (await db.execute(select(EventType).where(EventType.user_id == user.id))).scalars().all()
    et_name = {e.id: e.name for e in event_types}

    files = {
        "profile.json": json.dumps({"username": user.username, "email": user.email, "name": user.name, "timezone": user.timezone, "exported_at": datetime.now(timezone.utc).isoformat()}, indent=2),
        "clients.csv": _csv([{"name": c.name, "contact_name": c.contact_name or "", "billing_email": c.billing_email or "", "address": c.address or "", "hourly_rate": str(c.hourly_rate), "currency": c.currency, "payment_terms_days": c.payment_terms_days} for c in clients]),
        "time_entries.csv": _csv([{"date": e.entry_date.isoformat(), "client": client_name.get(e.client_id, ""), "hours": str(e.hours), "description": e.description, "invoice": inv_number.get(e.invoice_id, "") if e.invoice_id else ""} for e in entries]),
        "invoices.csv": _csv([{"number": i.number, "client": i.client_name, "status": i.status, "issue_date": i.issue_date.isoformat(), "due_date": i.due_date.isoformat(), "period_start": i.period_start.isoformat(), "period_end": i.period_end.isoformat(), "currency": i.currency, "subtotal": str(i.subtotal), "sent_at": i.sent_at.isoformat() if i.sent_at else "", "paid_at": i.paid_at.isoformat() if i.paid_at else ""} for i in invoices]),
        "invoice_lines.csv": _csv([{"invoice": inv_number.get(l.invoice_id, ""), "date": l.line_date.isoformat(), "description": l.description, "hours": str(l.hours), "rate": str(l.rate), "amount": str(l.amount)} for l in lines]),
        "bookings.csv": _csv([{"event_type": et_name.get(b.event_type_id, ""), "visitor_name": b.visitor_name, "visitor_email": b.visitor_email, "starts_at": b.starts_at.isoformat(), "ends_at": b.ends_at.isoformat(), "timezone": b.timezone, "status": b.status, "company": b.visitor_company or "", "notes": b.visitor_notes or ""} for b in bookings]),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="timeiq-export-{stamp}.zip"'},
    )


@router.delete("/api/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel billing, remove the Clerk user, and delete every row we hold.

    Order matters: Stripe first (so no renewal fires), then Clerk (so the
    session dies), then our rows (cascade). If Clerk deletion fails we stop
    before touching our data so the account stays consistent.
    """
    from app.services import billing

    if billing.enabled() and user.stripe_subscription_id and user.subscription_status in billing.PAID_STATUSES:
        try:
            import stripe

            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.cancel(user.stripe_subscription_id)
        except Exception as exc:  # keep going; a dangling test/live sub is recoverable in Stripe
            logger.error("Stripe cancel during account deletion failed for %s: %s", user.email, exc)

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.delete(
            f"https://api.clerk.com/v1/users/{user.clerk_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
        )
    if resp.status_code not in (200, 204, 404):
        logger.error("Clerk delete failed for %s: %s %s", user.email, resp.status_code, resp.text[:200])
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not remove sign-in account")

    await db.delete(user)
    await db.flush()
    logger.info("Deleted account %s", user.email)
