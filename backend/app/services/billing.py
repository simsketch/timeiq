"""Stripe subscriptions: founder pricing, checkout, portal, and webhook handling."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.guest_checkout import GuestCheckout
from app.models.user import User

logger = logging.getLogger(__name__)

ENTITLED_STATUSES = frozenset({"active", "trialing", "past_due", "complimentary"})
PAID_STATUSES = frozenset({"active", "trialing", "past_due"})
# A subscription in one of these can never charge again.
ENDED_STATUSES = frozenset({"none", "canceled", "incomplete_expired"})
PLAN_FOUNDER = "founder"
PLAN_STANDARD = "standard"

_price_cache: dict[str, dict[str, Any]] = {}

# A founder checkout holds its seat for a while. Stripe's shortest Checkout
# Session lifetime is 30 minutes; founder sessions are created to expire after
# CHECKOUT_TTL, and the hold outlives that so a payment finished in the last
# minute still has its seat while the webhook is in flight.
CHECKOUT_TTL = timedelta(minutes=31)
FOUNDER_RESERVATION_TTL = timedelta(minutes=35)
# pg_advisory_xact_lock key that serializes founder-seat allocation.
_FOUNDER_LOCK_KEY = 0x71730001
# Anyone can open a guest checkout, so cap how many founder seats open guest
# checkouts may hold at once. Past the cap a guest still gets the founder
# price while seats remain, just without a hold.
MAX_GUEST_HOLDS = 10
GUEST_REF_PREFIX = "guest:"


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


def _paid_founder():
    return and_(User.subscription_plan == PLAN_FOUNDER, User.subscription_status.in_(PAID_STATUSES))


async def founder_seats_taken(db: AsyncSession, exclude_user_id: Any = None) -> int:
    """Paid founder subscriptions plus unexpired founder checkout holds.

    Counts users and unclaimed guest checkouts (a claimed one is counted
    through the user it was attached to).
    """
    now = datetime.now(timezone.utc)
    held = and_(User.founder_reserved_until > now, not_(_paid_founder()))
    if exclude_user_id is not None:
        held = and_(held, User.id != exclude_user_id)
    users = await db.execute(
        select(func.count()).select_from(User).where(or_(_paid_founder(), held))
    )
    return int(users.scalar_one()) + await _guest_founder_seats(db, now)


def _unclaimed_founder_guest():
    # claimed_at survives the claiming user being deleted (claimed_by_user_id
    # goes NULL then), so a deleted account's purchase never counts again.
    return and_(GuestCheckout.plan == PLAN_FOUNDER, GuestCheckout.claimed_at.is_(None))


async def _guest_founder_seats(db: AsyncSession, now: datetime) -> int:
    paid = GuestCheckout.subscription_status.in_(PAID_STATUSES)
    held = and_(GuestCheckout.reserved_until > now, not_(paid))
    result = await db.execute(
        select(func.count())
        .select_from(GuestCheckout)
        .where(_unclaimed_founder_guest(), or_(paid, held))
    )
    return int(result.scalar_one())


async def _guest_holds_open(db: AsyncSession, now: datetime) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(GuestCheckout)
        .where(
            _unclaimed_founder_guest(),
            GuestCheckout.reserved_until > now,
            not_(GuestCheckout.subscription_status.in_(PAID_STATUSES)),
        )
    )
    return int(result.scalar_one())


async def _lock_founder_seats(db: AsyncSession) -> None:
    """Serialize seat allocation until this transaction ends (Postgres only)."""
    if db.bind.dialect.name == "postgresql":
        await db.execute(select(func.pg_advisory_xact_lock(_FOUNDER_LOCK_KEY)))


async def choose_price(db: AsyncSession, user: User | None = None) -> tuple[str, str]:
    """Pick the price for a new checkout, holding a founder seat for ``user``.

    Runs under an advisory lock so two checkouts can't both take the last
    seat. The hold commits with the request's transaction; once the cap is
    reached by paid seats plus open holds, new checkouts get the standard price.
    """
    if not settings.STRIPE_PRICE_FOUNDER:
        return settings.STRIPE_PRICE_STANDARD, PLAN_STANDARD
    await _lock_founder_seats(db)
    now = datetime.now(timezone.utc)
    if user is not None:
        # Re-read under the lock in case another request changed it.
        await db.refresh(user, ["founder_reserved_until"])
    holds_seat = (
        user is not None
        and user.founder_reserved_until is not None
        and user.founder_reserved_until > now
    )
    if not holds_seat:
        taken = await founder_seats_taken(db, exclude_user_id=user.id if user is not None else None)
        if taken >= settings.FOUNDER_SEATS:
            return settings.STRIPE_PRICE_STANDARD, PLAN_STANDARD
    if user is not None:
        user.founder_reserved_until = now + FOUNDER_RESERVATION_TTL
        await db.flush()
    return settings.STRIPE_PRICE_FOUNDER, PLAN_FOUNDER


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
            "founder_price_cents": 1900,
            "standard_price_cents": 2900,
            "currency": "USD",
            "founder_seats": settings.FOUNDER_SEATS,
            "founder_seats_left": settings.FOUNDER_SEATS,
        }
    taken = await founder_seats_taken(db)  # includes open checkout holds
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
    price_id, plan = await choose_price(db, user)
    customer_id = _ensure_customer(user)
    await db.flush()
    extra: dict[str, Any] = {}
    if plan == PLAN_FOUNDER:
        # The seat is only held for FOUNDER_RESERVATION_TTL, so the session
        # must close before the hold lapses.
        extra["expires_at"] = int((datetime.now(timezone.utc) + CHECKOUT_TTL).timestamp())
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        client_reference_id=str(user.id),
        line_items=[{"price": price_id, "quantity": 1}],
        allow_promotion_codes=True,
        success_url=f"{settings.FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/pricing",
        subscription_data={"metadata": {"timeiq_user_id": str(user.id), "plan": plan}},
        **extra,
    )
    return session["url"]


async def create_guest_checkout_session(db: AsyncSession) -> str:
    """Checkout for someone without an account yet; Stripe collects the email.

    The buyer creates their TimeIQ account after paying and the subscription
    is attached then (see claim_guest_session / claim_guest_by_email).
    """
    _init()
    now = datetime.now(timezone.utc)
    guest = GuestCheckout(plan=PLAN_STANDARD)
    price_id = settings.STRIPE_PRICE_STANDARD
    if settings.STRIPE_PRICE_FOUNDER:
        await _lock_founder_seats(db)
        if await founder_seats_taken(db) < settings.FOUNDER_SEATS:
            price_id, guest.plan = settings.STRIPE_PRICE_FOUNDER, PLAN_FOUNDER
            if await _guest_holds_open(db, now) < MAX_GUEST_HOLDS:
                guest.reserved_until = now + FOUNDER_RESERVATION_TTL
    db.add(guest)
    await db.flush()
    extra: dict[str, Any] = {}
    if guest.plan == PLAN_FOUNDER:
        extra["expires_at"] = int((now + CHECKOUT_TTL).timestamp())
    session = stripe.checkout.Session.create(
        mode="subscription",
        client_reference_id=f"{GUEST_REF_PREFIX}{guest.id}",
        line_items=[{"price": price_id, "quantity": 1}],
        allow_promotion_codes=True,
        success_url=f"{settings.FRONTEND_URL}/billing/welcome?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/pricing",
        subscription_data={"metadata": {"timeiq_guest_checkout_id": str(guest.id), "plan": guest.plan}},
        **extra,
    )
    guest.stripe_session_id = session["id"]
    await db.flush()
    return session["url"]


def _guest_id_from_ref(ref: str | None) -> uuid.UUID | None:
    if ref and ref.startswith(GUEST_REF_PREFIX):
        try:
            return uuid.UUID(ref[len(GUEST_REF_PREFIX):])
        except ValueError:
            return None
    return None


def _apply_to_guest(guest: GuestCheckout, sub: dict, email: str | None = None) -> None:
    guest.stripe_subscription_id = sub["id"]
    guest.subscription_status = sub["status"]
    if sub.get("customer"):
        guest.stripe_customer_id = sub["customer"]
    if email:
        guest.email = email.strip().lower()
    if sub["status"] in PAID_STATUSES:
        guest.reserved_until = None


class ClaimError(ValueError):
    pass


def _attach_guest(user: User, guest: GuestCheckout) -> None:
    """Move a paid guest subscription onto ``user``."""
    if guest.claimed_at is not None and guest.claimed_by_user_id != user.id:
        raise ClaimError("This purchase is already linked to another TimeIQ account")
    if not guest.stripe_subscription_id:
        raise ClaimError("Payment hasn't finished yet")
    if (
        user.stripe_subscription_id
        and user.stripe_subscription_id != guest.stripe_subscription_id
        and user.subscription_status in PAID_STATUSES
    ):
        raise ClaimError("This account already has a subscription")
    sub = _d(stripe.Subscription.retrieve(guest.stripe_subscription_id))
    user.stripe_customer_id = sub.get("customer") or guest.stripe_customer_id
    apply_subscription(user, sub)
    _apply_to_guest(guest, sub)
    guest.claimed_by_user_id = user.id
    guest.claimed_at = datetime.now(timezone.utc)
    try:  # Point Stripe's records at the account; not needed for access.
        stripe.Subscription.modify(sub["id"], metadata={"timeiq_user_id": str(user.id)})
        if user.stripe_customer_id:
            stripe.Customer.modify(
                user.stripe_customer_id,
                metadata={"timeiq_user_id": str(user.id), "clerk_id": user.clerk_id},
            )
    except Exception as exc:
        logger.warning("Could not tag Stripe records for %s: %s", user.id, exc)


async def guest_session_info(db: AsyncSession, session_id: str) -> dict[str, Any]:
    """What the post-payment page needs: whether it's paid, and for what."""
    _init()
    session = _d(stripe.checkout.Session.retrieve(session_id))
    guest_id = _guest_id_from_ref(session.get("client_reference_id"))
    if not guest_id:
        raise ClaimError("Not a guest checkout")
    guest = await db.get(GuestCheckout, guest_id)
    if guest is None:
        raise ClaimError("Checkout not found")
    email = (session.get("customer_details") or {}).get("email")
    if session.get("subscription") and guest.subscription_status == "none":
        # The webhook may not have arrived yet; record the payment now.
        sub = _d(stripe.Subscription.retrieve(session["subscription"]))
        _apply_to_guest(guest, sub, email)
        await db.flush()
    return {
        "paid": guest.subscription_status in PAID_STATUSES,
        "email": email or guest.email,
        "plan": guest.plan,
        "amount_cents": session.get("amount_total"),
        "currency": (session.get("currency") or "usd").upper(),
        "claimed": guest.claimed_by_user_id is not None,
    }


async def claim_guest_session(db: AsyncSession, user: User, session_id: str) -> None:
    """Attach the guest purchase behind a Checkout Session to ``user``.

    Holding the session id (it is only shown to the buyer, in the success
    redirect) is enough to claim it, so this works even if the account uses a
    different email than the one paid with.
    """
    await guest_session_info(db, session_id)  # records the payment if needed
    guest = (
        await db.execute(
            select(GuestCheckout).where(GuestCheckout.stripe_session_id == session_id).with_for_update()
        )
    ).scalar_one()
    _attach_guest(user, guest)
    await db.flush()


async def claim_guest_by_email(db: AsyncSession, user: User) -> bool:
    """Attach an unclaimed paid guest purchase made with this account's email."""
    if not enabled() or is_entitled(user) or not user.email:
        return False
    guest = (
        await db.execute(
            select(GuestCheckout)
            .where(
                GuestCheckout.email == user.email.strip().lower(),
                GuestCheckout.claimed_at.is_(None),
                GuestCheckout.subscription_status.in_(PAID_STATUSES),
            )
            .order_by(GuestCheckout.created_at.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if guest is None:
        return False
    _init()
    try:
        _attach_guest(user, guest)
    except ClaimError as exc:
        logger.info("Not claiming guest checkout %s for %s: %s", guest.id, user.id, exc)
        return False
    await db.flush()
    logger.info("Claimed guest checkout %s for %s by email", guest.id, user.id)
    return True


def create_portal_session(user: User) -> str:
    _init()
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/settings",
    )
    return session["url"]


def cancel_subscription(subscription_id: str) -> None:
    """Cancel a subscription immediately.

    One that no longer exists, or has already ended, counts as cancelled.
    Any other failure raises so the caller can stop what it was doing.
    """
    _init()
    try:
        stripe.Subscription.cancel(subscription_id)
    except stripe.InvalidRequestError as exc:
        if getattr(exc, "code", None) == "resource_missing":
            return
        # Cancelling an already-cancelled subscription is also an invalid
        # request; check its state instead of trusting the message text.
        current = _d(stripe.Subscription.retrieve(subscription_id))
        if current.get("status") in ENDED_STATUSES:
            return
        raise


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
    if sub["status"] in PAID_STATUSES:
        # The seat is settled (as a paid founder or on the standard price).
        user.founder_reserved_until = None


def _created(sub: dict) -> int:
    return int(sub.get("created") or 0)


def _subscription_to_apply(user: User, sub: dict) -> dict | None:
    """Decide which subscription a webhook should leave on the user.

    Stripe delivers events late and out of order, and a customer's old
    subscription can wind down after a new one started. An event for the
    subscription on file always applies. For any other subscription, look at
    all of the customer's subscriptions and keep the newest entitled one; the
    event's own (ended) state lands only when nothing is entitled.
    Returns None when the event should be ignored.
    """
    current_id = user.stripe_subscription_id
    if not current_id or current_id == sub["id"]:
        return sub

    customer_id = sub.get("customer") or user.stripe_customer_id
    try:
        listed = _d(stripe.Subscription.list(customer=customer_id, status="all", limit=100))
        known = [_d(s) for s in listed.get("data", [])]
    except Exception as exc:  # Stripe unreachable: decide from what we hold
        logger.warning("Could not list subscriptions for %s: %s", customer_id, exc)
        if sub["status"] in ENTITLED_STATUSES and not is_entitled(user):
            return sub
        return None

    by_id = {s["id"]: s for s in known}
    by_id[sub["id"]] = sub  # the freshly retrieved copy wins
    entitled = [s for s in by_id.values() if s.get("status") in ENTITLED_STATUSES]
    if entitled:
        best = max(entitled, key=_created)
        if best["id"] != sub["id"] and best["id"] == current_id and is_entitled(user):
            return None  # still on the subscription we track; nothing changes
        return best
    # Nothing is entitled. Keep the tracked subscription if Stripe still shows
    # it open (e.g. incomplete); otherwise this event's ended state is accurate.
    tracked = by_id.get(current_id)
    if tracked is not None and tracked.get("status") not in ENDED_STATUSES:
        return tracked
    return sub


async def confirm_checkout(user: User, session_id: str, db: AsyncSession) -> None:
    """Apply the subscription from a completed Checkout Session right away.

    A guest checkout (paid before signing up) is claimed for ``user``.
    """
    _init()
    session = _d(stripe.checkout.Session.retrieve(session_id, expand=["subscription"]))
    if _guest_id_from_ref(session.get("client_reference_id")):
        await claim_guest_session(db, user, session_id)
        return
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
    guest_id = _guest_id_from_ref(user_id)
    async with async_session() as db:
        if guest_id is not None:
            await _guest_checkout_completed(db, guest_id, sub, obj)
            return
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
            guest = (
                await db.execute(
                    select(GuestCheckout)
                    .where(GuestCheckout.stripe_subscription_id == sub["id"])
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if guest is not None:
                _apply_to_guest(guest, sub)
                await db.commit()
                logger.info("Applied %s to guest checkout %s: status=%s", etype, guest.id, sub["status"])
                return
            logger.warning("Stripe event %s for unknown customer %s", etype, customer_id)
            return
        chosen = _subscription_to_apply(user, sub)
        if chosen is None:
            logger.info(
                "Ignoring %s for %s: the subscription on file is %s",
                etype, sub["id"], user.stripe_subscription_id,
            )
            return
        apply_subscription(user, chosen)
        await db.commit()
        logger.info(
            "Applied %s to %s: status=%s plan=%s",
            etype, user.email, user.subscription_status, user.subscription_plan,
        )


async def _guest_checkout_completed(db: AsyncSession, guest_id: uuid.UUID, sub: dict, session: dict) -> None:
    guest = (
        await db.execute(select(GuestCheckout).where(GuestCheckout.id == guest_id).with_for_update())
    ).scalar_one_or_none()
    if guest is None:
        logger.warning("checkout.session.completed for unknown guest checkout %s", guest_id)
        return
    email = (session.get("customer_details") or {}).get("email")
    _apply_to_guest(guest, sub, email)
    if guest.claimed_by_user_id is not None:
        user = await db.get(User, guest.claimed_by_user_id)
        if user is not None:
            apply_subscription(user, sub)
    await db.commit()
    logger.info("Guest checkout %s paid: status=%s", guest.id, sub["status"])
