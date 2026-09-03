"""Stripe subscriptions: founder pricing, checkout, portal, and webhook handling."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import stripe
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.user import User

logger = logging.getLogger(__name__)

ENTITLED_STATUSES = frozenset({"active", "trialing", "past_due", "complimentary"})
PAID_STATUSES = frozenset({"active", "trialing", "past_due"})
PLAN_FOUNDER = "founder"
PLAN_STANDARD = "standard"

_price_cache: dict[str, dict[str, Any]] = {}


def _d(obj: Any) -> Any:
    """Plain-dict view of a Stripe object (or pass through dicts, e.g. in tests)."""
    if isinstance(obj, stripe.StripeObject):
        return obj.to_dict()  # recursive in stripe-python >= 7
    return obj


def enabled() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def _init() -> None:
    stripe.api_key = settings.STRIPE_SECRET_KEY


def is_entitled(user: User) -> bool:
    return user.subscription_status in ENTITLED_STATUSES


def plan_for_price(price_id: str | None) -> str:
    if price_id and price_id == settings.STRIPE_PRICE_FOUNDER:
        return PLAN_FOUNDER
    return PLAN_STANDARD


async def founder_seats_taken(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(User).where(
            User.subscription_plan == PLAN_FOUNDER,
            User.subscription_status.in_(PAID_STATUSES),
        )
    )
    return int(result.scalar_one())


async def choose_price(db: AsyncSession) -> tuple[str, str]:
    taken = await founder_seats_taken(db)
    if settings.STRIPE_PRICE_FOUNDER and taken < settings.FOUNDER_SEATS:
        return settings.STRIPE_PRICE_FOUNDER, PLAN_FOUNDER
    return settings.STRIPE_PRICE_STANDARD, PLAN_STANDARD


def _price(price_id: str) -> dict[str, Any]:
    if price_id not in _price_cache:
        _init()
        p = _d(stripe.Price.retrieve(price_id))
        _price_cache[price_id] = {
            "cents": p["unit_amount"],
            "currency": p["currency"].upper(),
            "interval": p["recurring"]["interval"] if p.get("recurring") else None,
        }
    return _price_cache[price_id]


async def pricing_info(db: AsyncSession) -> dict[str, Any]:
    if not enabled():
        return {
            "enabled": False,
            "founder_price_cents": 500,
            "standard_price_cents": 2900,
            "currency": "USD",
            "founder_seats": settings.FOUNDER_SEATS,
            "founder_seats_left": settings.FOUNDER_SEATS,
        }
    taken = await founder_seats_taken(db)
    founder = _price(settings.STRIPE_PRICE_FOUNDER) if settings.STRIPE_PRICE_FOUNDER else None
    standard = _price(settings.STRIPE_PRICE_STANDARD)
    return {
        "enabled": True,
        "founder_price_cents": founder["cents"] if founder else None,
        "standard_price_cents": standard["cents"],
        "currency": standard["currency"],
        "founder_seats": settings.FOUNDER_SEATS,
        "founder_seats_left": max(settings.FOUNDER_SEATS - taken, 0) if founder else 0,
    }


def status_payload(user: User) -> dict[str, Any]:
    return {
        "enabled": enabled(),
        "entitled": (not enabled()) or is_entitled(user),
        "status": user.subscription_status,
        "plan": user.subscription_plan,
        "current_period_end": user.subscription_current_period_end,
        "has_customer": bool(user.stripe_customer_id),
    }


def _ensure_customer(user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    _init()
    customer = stripe.Customer.create(
        email=user.email,
        name=user.name or None,
        metadata={"timeiq_user_id": str(user.id), "clerk_id": user.clerk_id},
    )
    user.stripe_customer_id = customer["id"]
    return customer["id"]


async def create_checkout_session(user: User, db: AsyncSession) -> str:
    _init()
    price_id, plan = await choose_price(db)
    customer_id = _ensure_customer(user)
    await db.flush()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        client_reference_id=str(user.id),
        line_items=[{"price": price_id, "quantity": 1}],
        allow_promotion_codes=True,
        success_url=f"{settings.FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/pricing",
        subscription_data={"metadata": {"timeiq_user_id": str(user.id), "plan": plan}},
    )
    return session["url"]


def create_portal_session(user: User) -> str:
    _init()
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/settings",
    )
    return session["url"]


def _period_end(sub: Any) -> datetime | None:
    ts = sub.get("current_period_end")
    if ts is None:
        items = sub.get("items", {}).get("data", [])
        if items:
            ts = items[0].get("current_period_end")
    return datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None


def apply_subscription(user: User, sub: Any) -> None:
    """Copy the relevant bits of a Stripe Subscription onto the user."""
    sub = _d(sub)
    items = sub.get("items", {}).get("data", [])
    price_id = items[0]["price"]["id"] if items else None
    user.stripe_subscription_id = sub["id"]
    user.subscription_status = sub["status"]
    user.subscription_plan = plan_for_price(price_id)
    user.subscription_current_period_end = _period_end(sub)
    if sub.get("customer") and not user.stripe_customer_id:
        user.stripe_customer_id = sub["customer"]


async def confirm_checkout(user: User, session_id: str) -> None:
    """Apply the subscription from a completed Checkout Session right away."""
    _init()
    session = _d(stripe.checkout.Session.retrieve(session_id, expand=["subscription"]))
    if session.get("client_reference_id") != str(user.id):
        raise ValueError("Checkout session does not belong to this user")
    sub = session.get("subscription")
    if not sub:
        raise ValueError("Checkout session has no subscription yet")
    apply_subscription(user, sub)


async def handle_webhook(payload: bytes, sig_header: str | None) -> None:
    _init()
    event = _d(
        stripe.Webhook.construct_event(
            payload, sig_header or "", settings.STRIPE_WEBHOOK_SECRET
        )
    )
    etype = event["type"]
    obj = event["data"]["object"]

    subscription_id: str | None = None
    customer_id: str | None = obj.get("customer")
    user_id: str | None = None

    if etype == "checkout.session.completed":
        subscription_id = obj.get("subscription")
        user_id = obj.get("client_reference_id")
    elif etype.startswith("customer.subscription."):
        subscription_id = obj["id"]
    elif etype in ("invoice.paid", "invoice.payment_failed"):
        subscription_id = obj.get("subscription")
        if isinstance(subscription_id, dict):
            subscription_id = subscription_id.get("id")
    else:
        logger.info("Ignoring Stripe event %s", etype)
        return

    if not subscription_id:
        logger.info("Stripe event %s without subscription; ignoring", etype)
        return

    sub = _d(stripe.Subscription.retrieve(subscription_id))
    async with async_session() as db:
        query = select(User)
        if user_id:
            query = query.where(User.id == user_id)
        else:
            query = query.where(User.stripe_customer_id == customer_id)
        user = (await db.execute(query)).scalar_one_or_none()
        if user is None and sub.get("metadata", {}).get("timeiq_user_id"):
            user = (
                await db.execute(
                    select(User).where(User.id == sub["metadata"]["timeiq_user_id"])
                )
            ).scalar_one_or_none()
        if user is None:
            logger.warning("Stripe event %s for unknown customer %s", etype, customer_id)
            return
        apply_subscription(user, sub)
        await db.commit()
        logger.info(
            "Applied %s to %s: status=%s plan=%s",
            etype, user.email, user.subscription_status, user.subscription_plan,
        )
