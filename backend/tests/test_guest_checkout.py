"""Pay first, create the account after: guest checkout, seat holds and claiming.

Database-backed like test_qa_db_races (same fixture); Stripe is mocked.
"""
from __future__ import annotations

import uuid

import stripe
from sqlalchemy import delete, select

from app.config import settings
from app.database import async_session
from app.models.guest_checkout import GuestCheckout
from app.models.user import User
from app.services import billing
from tests.test_qa_db_races import env, pytestmark  # noqa: F401  (shared fixture and skip rule)


class FakeStripe:
    """Just enough of Stripe for checkout, retrieval and claiming."""

    def __init__(self, monkeypatch):
        self.sessions: dict[str, dict] = {}
        self.subs: dict[str, dict] = {}
        self.created: list[dict] = []
        self.modified: list[tuple] = []
        billing._price_cache.clear()
        monkeypatch.setattr(stripe.Price, "retrieve", lambda p: {"unit_amount": 1900, "currency": "usd", "recurring": {"interval": "year"}})
        monkeypatch.setattr(stripe.checkout.Session, "create", self._create)
        monkeypatch.setattr(stripe.checkout.Session, "retrieve", lambda sid, **kw: self.sessions[sid])
        monkeypatch.setattr(stripe.Subscription, "retrieve", lambda sid: self.subs[sid])
        monkeypatch.setattr(stripe.Subscription, "modify", lambda sid, **kw: self.modified.append(("sub", sid, kw)))
        monkeypatch.setattr(stripe.Customer, "modify", lambda cid, **kw: self.modified.append(("cus", cid, kw)))

    def _create(self, **kw):
        sid = f"cs_test_{uuid.uuid4().hex[:12]}"
        self.created.append(kw)
        self.sessions[sid] = {"id": sid, "url": f"https://checkout/{sid}", "client_reference_id": kw["client_reference_id"],
                              "subscription": None, "customer_details": None, "amount_total": None, "currency": "usd"}
        return self.sessions[sid]

    def pay(self, sid: str, email: str, price: str = "price_founder") -> str:
        sub_id = f"sub_{uuid.uuid4().hex[:10]}"
        cus = f"cus_{uuid.uuid4().hex[:10]}"
        self.subs[sub_id] = {"id": sub_id, "status": "active", "customer": cus, "created": 1,
                             "current_period_end": 1893456000,
                             "items": {"data": [{"price": {"id": price}}]}, "metadata": {}}
        self.sessions[sid].update(subscription=sub_id, customer_details={"email": email}, amount_total=1900)
        return sub_id


async def _start(env, fake) -> str:
    r = await env.client.post("/api/billing/guest-checkout")
    assert r.status_code == 200, r.text
    return r.json()["url"].rsplit("/", 1)[1]


async def _cleanup(*session_ids):
    async with async_session() as db:
        await db.execute(delete(GuestCheckout).where(GuestCheckout.stripe_session_id.in_(session_ids)))
        await db.commit()


async def test_guest_pays_then_claims_with_session(env, monkeypatch):
    fake = FakeStripe(monkeypatch)
    sid = await _start(env, fake)
    created = fake.created[0]
    assert "customer" not in created and created["client_reference_id"].startswith("guest:")
    assert created["success_url"].endswith("/billing/welcome?session_id={CHECKOUT_SESSION_ID}")
    assert created["line_items"][0]["price"] == "price_founder" and "expires_at" in created

    info = (await env.client.get(f"/api/billing/guest-session/{sid}")).json()
    assert info["paid"] is False

    sub_id = fake.pay(sid, "New.Buyer@Example.com")
    info = (await env.client.get(f"/api/billing/guest-session/{sid}")).json()
    assert info == {"paid": True, "email": "New.Buyer@Example.com", "plan": "founder",
                    "amount_cents": 1900, "currency": "USD", "claimed": False}

    buyer = env.users[1]  # signed up with a different email: the session id still claims it
    env.as_user(buyer)
    r = await env.client.post("/api/billing/confirm", json={"session_id": sid})
    assert r.status_code == 200, r.text
    assert r.json()["entitled"] is True and r.json()["plan"] == "founder"
    async with async_session() as db:
        u = await db.get(User, buyer.id)
        assert u.stripe_subscription_id == sub_id and u.subscription_status == "active"
    assert any(m[0] == "sub" and m[2]["metadata"]["timeiq_user_id"] == str(buyer.id) for m in fake.modified)

    # Someone else can't take it, and claiming again is harmless.
    env.as_user(env.users[2])
    r = await env.client.post("/api/billing/confirm", json={"session_id": sid})
    assert r.status_code == 400 and "another" in r.json()["detail"]
    env.as_user(buyer)
    assert (await env.client.post("/api/billing/confirm", json={"session_id": sid})).status_code == 200
    await _cleanup(sid)


async def test_guest_purchase_claimed_by_matching_email(env, monkeypatch):
    fake = FakeStripe(monkeypatch)
    sid = await _start(env, fake)
    buyer = env.users[2]
    fake.pay(sid, buyer.email.upper())
    await env.client.get(f"/api/billing/guest-session/{sid}")  # records the payment

    env.as_user(buyer)
    status = (await env.client.get("/api/billing/status")).json()
    assert status["entitled"] is True and status["plan"] == "founder"
    async with async_session() as db:
        g = (await db.execute(select(GuestCheckout).where(GuestCheckout.stripe_session_id == sid))).scalar_one()
        assert g.claimed_by_user_id == buyer.id
    await _cleanup(sid)


async def test_guest_checkouts_hold_and_count_founder_seats(env, monkeypatch):
    fake = FakeStripe(monkeypatch)
    async with async_session() as db:
        before = await billing.founder_seats_taken(db)
    monkeypatch.setattr(settings, "FOUNDER_SEATS", before + 1)

    first = await _start(env, fake)   # takes the last seat
    second = await _start(env, fake)  # sold at the standard price
    assert [c["line_items"][0]["price"] for c in fake.created] == ["price_founder", "price_standard"]
    assert (await env.client.get("/api/billing/pricing")).json()["founder_seats_left"] == 0

    # Once paid (and still unclaimed) the seat stays taken without the hold.
    fake.pay(first, "a@example.com")
    await env.client.get(f"/api/billing/guest-session/{first}")
    async with async_session() as db:
        g = (await db.execute(select(GuestCheckout).where(GuestCheckout.stripe_session_id == first))).scalar_one()
        assert g.reserved_until is None
        assert await billing.founder_seats_taken(db) == before + 1
    await _cleanup(first, second)


async def test_guest_holds_are_capped(env, monkeypatch):
    fake = FakeStripe(monkeypatch)
    monkeypatch.setattr(billing, "MAX_GUEST_HOLDS", 2)
    monkeypatch.setattr(settings, "FOUNDER_SEATS", 10_000)
    sids = []
    try:
        sids += [await _start(env, fake) for _ in range(3)]
        async with async_session() as db:
            rows = (await db.execute(select(GuestCheckout).where(GuestCheckout.stripe_session_id.in_(sids)))).scalars().all()
            held = [g for g in rows if g.reserved_until is not None]
        # Every founder-priced guest checkout holds a seat; past the hold cap new
        # guests get the standard price, so unheld sessions can't oversell seats.
        assert len(held) == 2 and all(g.plan == "founder" for g in held)
        assert sorted(g.plan for g in rows) == ["founder", "founder", "standard"]
        assert [c["line_items"][0]["price"] for c in fake.created] == ["price_founder", "price_founder", "price_standard"]
        assert all("expires_at" in c for c in fake.created)
    finally:
        await _cleanup(*sids)


async def test_guest_founder_cap_is_never_oversold(env, monkeypatch):
    fake = FakeStripe(monkeypatch)
    monkeypatch.setattr(billing, "MAX_GUEST_HOLDS", 2)
    async with async_session() as db:
        before = await billing.founder_seats_taken(db)
    monkeypatch.setattr(settings, "FOUNDER_SEATS", before + 3)
    sids = []
    try:
        sids += [await _start(env, fake) for _ in range(4)]
        prices = [c["line_items"][0]["price"] for c in fake.created]
        assert prices == ["price_founder", "price_founder", "price_standard", "price_standard"]
        for i, sid in enumerate(sids):
            fake.pay(sid, f"cap{i}@example.com", price=prices[i])
            assert (await env.client.get(f"/api/billing/guest-session/{sid}")).status_code == 200
        async with async_session() as db:
            assert await billing.founder_seats_taken(db) == before + 2 <= settings.FOUNDER_SEATS
    finally:
        await _cleanup(*sids)


async def test_unknown_session_is_not_found(env, monkeypatch):
    FakeStripe(monkeypatch)
    assert (await env.client.get("/api/billing/guest-session/not-a-session")).status_code == 404


async def test_deleted_account_purchase_stops_counting(env, monkeypatch):
    fake = FakeStripe(monkeypatch)
    sid = await _start(env, fake)
    fake.pay(sid, "gone@example.com")
    env.as_user(env.users[1])
    assert (await env.client.post("/api/billing/confirm", json={"session_id": sid})).status_code == 200
    async with async_session() as db:
        with_claimed = await billing.founder_seats_taken(db)
        g = (await db.execute(select(GuestCheckout).where(GuestCheckout.stripe_session_id == sid))).scalar_one()
        g.claimed_by_user_id = None  # what ON DELETE SET NULL leaves behind
        u = await db.get(User, env.users[1].id)
        u.subscription_status, u.subscription_plan = "canceled", None
        await db.commit()
        assert await billing.founder_seats_taken(db) == with_claimed - 1
    await _cleanup(sid)


async def test_entitled_user_cannot_open_checkout(env, monkeypatch):
    FakeStripe(monkeypatch)
    async with async_session() as db:
        u = await db.get(User, env.users[1].id)
        u.subscription_status = "complimentary"
        await db.commit()
    env.as_user(env.users[1])
    assert (await env.client.post("/api/billing/checkout")).status_code == 409
