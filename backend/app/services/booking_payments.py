"""Direct charges for bookings, separate from TimeIQ subscription billing."""
from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import stripe
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.services.booking_lock import lock_host_bookings
from app.services.email import send_booking_confirmation, send_cancellation_notice

CHECKOUT_TTL = timedelta(minutes=31)
REFUND_POLICY = "Guest cancellations more than 24 hours before the start receive a full refund. Guest cancellations within 24 hours receive no refund. Host cancellations receive a full refund."
UNAVAILABLE = "This host cannot accept payments right now. Contact the host or choose a free event."


def enabled() -> bool:
    return bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_CONNECT_WEBHOOK_SECRET)


async def stripe_call(method, *args, **kwargs):
    """Keep Stripe's synchronous SDK off the async request loop."""
    result = await asyncio.to_thread(method, *args, api_key=settings.STRIPE_SECRET_KEY, **kwargs)
    return result.to_dict() if isinstance(result, stripe.StripeObject) else result


def ready(user: User) -> bool:
    return bool(user.stripe_connect_account_id and user.stripe_connect_charges_enabled and user.stripe_connect_payouts_enabled)


def require_payments(host: User, event_type: EventType) -> None:
    if event_type.price_cents is not None and not (
        enabled() and host.stripe_connect_account_id and host.stripe_connect_charges_enabled
    ):
        raise HTTPException(status_code=409, detail=UNAVAILABLE)


async def refresh_account(user: User) -> dict:
    account = await stripe_call(stripe.Account.retrieve, user.stripe_connect_account_id)
    user.stripe_connect_charges_enabled = bool(account.get("charges_enabled"))
    user.stripe_connect_payouts_enabled = bool(account.get("payouts_enabled"))
    return account


async def require_pricing_ready(user: User) -> None:
    if not enabled() or not user.stripe_connect_account_id:
        raise HTTPException(status_code=409, detail="Connect Stripe on the Booking page and finish onboarding before setting a price.")
    try:
        await refresh_account(user)
    except stripe.StripeError:
        raise HTTPException(status_code=502, detail="Stripe could not check your account. Try saving again.")
    if not ready(user):
        raise HTTPException(status_code=409, detail="Finish Stripe onboarding on the Booking page before setting a price.")


async def limit_booking_emails(db: AsyncSession, email: str, *, cancellation: bool = False) -> None:
    """A database limit also works across separate serverless instances."""
    normalized = email.strip().lower()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"timeiq-booking-email:{normalized}"},
    )
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = Booking.cancelled_at > since if cancellation else Booking.created_at > since
    count = (await db.execute(select(func.count(Booking.id)).where(
        func.lower(Booking.visitor_email) == normalized,
        recent,
    ))).scalar_one()
    if count >= 10:
        raise HTTPException(status_code=429, detail="Too many booking requests for this email. Try again in an hour.")


async def create_checkout(booking: Booking, event_type: EventType, host: User) -> None:
    booking.status = "pending_payment"
    booking.price_cents = event_type.price_cents
    booking.currency = event_type.currency
    booking.stripe_connect_account_id = host.stripe_connect_account_id
    booking.payment_token = secrets.token_urlsafe(32)
    booking.payment_expires_at = datetime.now(timezone.utc) + CHECKOUT_TTL
    return_url = f"{settings.FRONTEND_URL.rstrip('/')}/bookings/{booking.id}/payment?token={booking.payment_token}"
    session = await stripe_call(
        stripe.checkout.Session.create,
        stripe_account=booking.stripe_connect_account_id,
        idempotency_key=f"booking-checkout:{booking.id}",
        mode="payment",
        payment_method_types=["card"],
        customer_email=booking.visitor_email,
        client_reference_id=str(booking.id),
        metadata={"booking_id": str(booking.id)},
        payment_intent_data={"metadata": {"booking_id": str(booking.id)}},
        line_items=[{"price_data": {
            "currency": booking.currency,
            "unit_amount": booking.price_cents,
            "product_data": {"name": event_type.name},
        }, "quantity": 1}],
        custom_text={"submit": {"message": REFUND_POLICY}},
        expires_at=int(booking.payment_expires_at.timestamp()),
        success_url=return_url,
        cancel_url=return_url,
    )
    booking.stripe_checkout_session_id = session["id"]
    booking.checkout_url = session["url"]


def refund_due(booking: Booking, *, as_host: bool, now: datetime | None = None) -> bool:
    return bool(booking.price_cents is not None and (
        as_host or booking.starts_at - (now or datetime.now(timezone.utc)) > timedelta(hours=24)
    ))


async def refund_payment(booking: Booking) -> None:
    if not booking.stripe_payment_intent_id or booking.stripe_refund_id:
        return
    refund = await stripe_call(
        stripe.Refund.create,
        payment_intent=booking.stripe_payment_intent_id,
        stripe_account=booking.stripe_connect_account_id,
        idempotency_key=f"booking-refund:{booking.stripe_payment_intent_id}",
    )
    if refund.get("status") in ("failed", "canceled"):
        raise HTTPException(status_code=502, detail="Stripe could not refund this payment. Try cancelling again or contact the host.")
    booking.stripe_refund_id = refund["id"]
    booking.refund_status = refund.get("status", "pending")


def matches_session(booking: Booking, session: dict) -> bool:
    return bool(
        session.get("id") == booking.stripe_checkout_session_id
        and (session.get("metadata") or {}).get("booking_id") == str(booking.id)
        and session.get("mode") == "payment"
        and session.get("amount_total") == booking.price_cents
        and session.get("currency") == booking.currency
    )


async def apply_session(booking: Booking, session: dict) -> bool:
    """Apply a verified session under the host and row locks. Return newly confirmed."""
    if not matches_session(booking, session):
        return False
    if session.get("status") == "complete" and session.get("payment_status") == "paid":
        if not session.get("payment_intent"):
            return False
        booking.stripe_payment_intent_id = session["payment_intent"]
        if booking.status == "pending_payment":
            booking.status = "confirmed"
            booking.payment_expires_at = None
            booking.checkout_url = None
            return True
        if booking.status in ("cancelled", "expired") and booking.refund_status != "not_eligible":
            await refund_payment(booking)
    elif session.get("status") == "expired" and booking.status == "pending_payment":
        booking.status = "expired"
        booking.checkout_url = None
    return False


async def close_checkout(booking: Booking) -> dict:
    """Close before releasing a slot; a payment racing expiry must be observed."""
    session = await stripe_call(stripe.checkout.Session.retrieve,
                                booking.stripe_checkout_session_id,
                                stripe_account=booking.stripe_connect_account_id)
    if session.get("status") == "open":
        try:
            session = await stripe_call(stripe.checkout.Session.expire,
                                        booking.stripe_checkout_session_id,
                                        stripe_account=booking.stripe_connect_account_id)
        except stripe.InvalidRequestError:
            # Checkout may have completed between retrieve and expire.
            session = await stripe_call(stripe.checkout.Session.retrieve,
                                        booking.stripe_checkout_session_id,
                                        stripe_account=booking.stripe_connect_account_id)
    if session.get("status") not in ("complete", "expired") or not matches_session(booking, session):
        raise HTTPException(status_code=502, detail="Stripe could not close checkout. Try again shortly.")
    return session


async def cancel_payment(booking: Booking, *, as_host: bool) -> None:
    if booking.price_cents is None:
        return
    try:
        if booking.status == "pending_payment":
            session = await close_checkout(booking)
            if session.get("payment_status") == "paid":
                booking.stripe_payment_intent_id = session.get("payment_intent")
                # A hold that never sent confirmation can always be refunded.
                await refund_payment(booking)
        elif refund_due(booking, as_host=as_host):
            await refund_payment(booking)
        else:
            booking.refund_status = "not_eligible"
    except stripe.StripeError:
        raise HTTPException(status_code=502, detail="Stripe could not process the cancellation. Try again shortly.")


def mark_cancelled(booking: Booking) -> None:
    """Mark cancelled and bump the invite sequence so the CANCEL supersedes it."""
    booking.status = "cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    booking.ical_sequence = (booking.ical_sequence or 0) + 1


async def cancel_upcoming_bookings(db: AsyncSession, host: User) -> int:
    """Cancel a host's upcoming bookings as the host: close checkouts, refund
    payments, then tell guests. Run before deleting the account, because the
    cascade would drop the bookings and their payment records with them.

    A Stripe failure raises (502) before anything is committed, so the caller
    stops the deletion and a retry starts over. Returns how many were cancelled.
    """
    await lock_host_bookings(db, host.id)
    bookings = (await db.execute(
        select(Booking)
        .where(
            Booking.host_user_id == host.id,
            Booking.status.in_(("confirmed", "pending_payment")),
            Booking.ends_at > datetime.now(timezone.utc),
        )
        .with_for_update()
    )).scalars().all()
    confirmed = []
    for booking in bookings:
        if booking.status == "confirmed":
            confirmed.append(booking)
        await cancel_payment(booking, as_host=True)
        mark_cancelled(booking)
    event_types = {
        et.id: et for et in (await db.execute(
            select(EventType).where(EventType.id.in_({b.event_type_id for b in confirmed}))
        )).scalars()
    } if confirmed else {}
    await db.commit()
    for booking in confirmed:
        if event_type := event_types.get(booking.event_type_id):
            await send_cancellation_notice(booking, event_type, host)
    return len(bookings)


async def send_confirmed(db: AsyncSession, booking: Booking) -> None:
    event_type = await db.get(EventType, booking.event_type_id)
    host = await db.get(User, booking.host_user_id)
    if event_type and host:
        await send_booking_confirmation(booking, event_type, host)


async def expire_holds(db: AsyncSession, host_id: uuid.UUID | None = None) -> int:
    """Reconcile due holds before freeing them, then commit before sending mail.

    Call only before taking booking locks. A Stripe outage keeps holds busy;
    checkout can never take payment after we give its slot to someone else.
    """
    query = select(Booking.host_user_id).where(
        Booking.status == "pending_payment",
        Booking.payment_expires_at <= datetime.now(timezone.utc),
    )
    if host_id is not None:
        query = query.where(Booking.host_user_id == host_id)
    hosts = (await db.execute(query.distinct().limit(100))).scalars().all()
    changed = 0
    for hid in hosts:
        await lock_host_bookings(db, hid)
        bookings = (await db.execute(select(Booking).where(
            Booking.host_user_id == hid,
            Booking.status == "pending_payment",
            Booking.payment_expires_at <= datetime.now(timezone.utc),
        ).with_for_update().execution_options(populate_existing=True))).scalars().all()
        confirmed = []
        for booking in bookings:
            try:
                session = await close_checkout(booking)
            except stripe.StripeError:
                raise HTTPException(status_code=502, detail="Stripe could not check an expired checkout. Try again shortly.")
            if await apply_session(booking, session):
                confirmed.append(booking)
            changed += 1
        await db.commit()
        for booking in confirmed:
            await send_confirmed(db, booking)
    return changed
