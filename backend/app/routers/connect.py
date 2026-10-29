from __future__ import annotations

import logging
import time
import uuid

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted
from app.config import settings
from app.database import get_db
from app.models.booking import Booking
from app.models.user import User
from app.services import booking_payments as payments
from app.services.booking_lock import lock_host_bookings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["booking payments"])


class OnboardingRequest(BaseModel):
    country: str = Field(default="US", pattern=r"^[A-Z]{2}$")


def require_connect() -> None:
    if not payments.enabled():
        raise HTTPException(status_code=503, detail="Booking payments are not configured. Contact the site owner.")


@router.get("/api/connect/status")
async def connect_status(user: User = Depends(get_current_user_unrestricted), db: AsyncSession = Depends(get_db)):
    if payments.enabled() and user.stripe_connect_account_id:
        try:
            await payments.refresh_account(user)
        except stripe.StripeError:
            raise HTTPException(status_code=502, detail="Stripe could not check your account. Try again shortly.")
    return {
        "enabled": payments.enabled(),
        "status": "not_connected" if not user.stripe_connect_account_id else "ready" if payments.ready(user) else "needs_info",
        "charges_enabled": bool(user.stripe_connect_charges_enabled),
        "payouts_enabled": bool(user.stripe_connect_payouts_enabled),
    }


@router.post("/api/connect/onboarding")
async def connect_onboarding(payload: OnboardingRequest, user: User = Depends(get_current_user_unrestricted), db: AsyncSession = Depends(get_db)):
    require_connect()
    user = (await db.execute(select(User).where(User.id == user.id).with_for_update()
                            .execution_options(populate_existing=True))).scalar_one()
    try:
        if not user.stripe_connect_account_id:
            account = await payments.stripe_call(
                # Stripe carries losses and hosts pay their own fees with a full Stripe Dashboard,
                # matching the platform setup (direct charges, no platform fee).
                stripe.Account.create, country=payload.country,
                controller={"stripe_dashboard": {"type": "full"}, "fees": {"payer": "account"},
                            "losses": {"payments": "stripe"}},
                email=user.email, capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
                metadata={"timeiq_user_id": str(user.id)}, # Stripe replays a key's stored result (errors included) for 24h, so a
                # 5-minute window absorbs double clicks without pinning a past refusal.
                idempotency_key=f"connect-account:{user.id}:{int(time.time() // 300)}",
            )
            user.stripe_connect_account_id = account["id"]
            # Keep the account even if link creation fails, so retrying resumes it.
            await db.commit()
        link = await payments.stripe_call(
            stripe.AccountLink.create, account=user.stripe_connect_account_id,
            type="account_onboarding",
            return_url=f"{settings.FRONTEND_URL.rstrip('/')}/event-types?connect=return",
            refresh_url=f"{settings.FRONTEND_URL.rstrip('/')}/event-types?connect=refresh",
        )
    except stripe.StripeError as exc:
        logger.warning("Connect onboarding failed for user %s: %s", user.id, exc.user_message or exc)
        if getattr(exc, "param", None) == "country":
            detail = "Stripe doesn't support that country code. Check it and try again."
        else:
            detail = "Stripe payouts aren't available right now. Try again later."
        raise HTTPException(status_code=502, detail=detail)
    return {"url": link["url"]}


@router.post("/api/connect/dashboard")
async def connect_dashboard(user: User = Depends(get_current_user_unrestricted)):
    require_connect()
    if not user.stripe_connect_account_id:
        raise HTTPException(status_code=409, detail="Connect Stripe on the Booking page before opening the dashboard.")
    # Hosts have full Stripe Dashboard accounts and sign in to Stripe directly.
    return {"url": "https://dashboard.stripe.com/"}


@router.post("/api/webhooks/stripe-connect")
async def connect_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    require_connect()
    try:
        event = stripe.Webhook.construct_event(await request.body(), request.headers.get("stripe-signature", ""), settings.STRIPE_CONNECT_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Stripe signature verification failed. Check the Connect webhook secret.")
    if isinstance(event, stripe.StripeObject):
        event = event.to_dict()
    obj = event["data"]["object"]
    account_id = event.get("account")
    if event["type"] == "account.updated":
        if account_id != obj.get("id"):
            return {"received": True}
        user = (await db.execute(select(User).where(User.stripe_connect_account_id == account_id)
                                 .with_for_update())).scalar_one_or_none()
        if user:
            # Re-fetch so a delayed event cannot restore old capabilities.
            await payments.refresh_account(user)
    elif event["type"] in ("checkout.session.completed", "checkout.session.expired"):
        try:
            booking_id = uuid.UUID((obj.get("metadata") or {}).get("booking_id", ""))
        except (ValueError, TypeError):
            return {"received": True}
        booking = (await db.execute(select(Booking).where(
            Booking.id == booking_id, Booking.stripe_connect_account_id == account_id,
            Booking.stripe_checkout_session_id == obj.get("id"),
        ))).scalar_one_or_none()
        if booking is None or not account_id:
            return {"received": True}
        await lock_host_bookings(db, booking.host_user_id)
        booking = (await db.execute(select(Booking).where(Booking.id == booking.id).with_for_update()
                                    .execution_options(populate_existing=True))).scalar_one()
        confirmed = await payments.apply_session(booking, obj)
        await db.commit()
        if confirmed:
            await payments.send_confirmed(db, booking)
    return {"received": True}


@router.get("/api/public/bookings/{booking_id}/payment")
async def payment_status(booking_id: uuid.UUID, token: str = Query(...), db: AsyncSession = Depends(get_db)):
    booking = (await db.execute(select(Booking).where(
        Booking.id == booking_id, Booking.payment_token == token,
    ))).scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=404, detail="Payment link not found. Open the complete link from checkout.")
    await payments.expire_holds(db, booking.host_user_id)
    await db.refresh(booking)
    return {"status": booking.status, "starts_at": booking.starts_at, "price_cents": booking.price_cents,
            "currency": booking.currency, "checkout_url": booking.checkout_url if booking.status == "pending_payment" else None,
            "refund_status": booking.refund_status}
