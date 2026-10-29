"""Paid bookings: Stripe is mocked; database tests only use local timeiq_qa*.

The race tests use real Postgres advisory locks rather than simulating them.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import re
import time
import uuid
from unittest.mock import AsyncMock
from datetime import datetime, time as day_time, timedelta, timezone
from types import SimpleNamespace as NS

import httpx
import pytest
import resend
import stripe
from fastapi import Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select

from app.auth import get_current_user, get_current_user_unrestricted
from app.config import settings
from app.database import async_session, engine, get_db
from app.main import app
from app.models.availability_rule import AvailabilityRule
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.event_type import EventTypeCreate, EventTypeUpdate
from app.services import booking_payments as P

SECRET = "whsec_connect_test"
LOCAL_QA = bool(re.search(r"@(localhost|127\.0\.0\.1)(:\d+)?/timeiq_qa\w*$", settings.async_database_url))


def signed(body):
    timestamp = str(int(time.time()))
    signature = hmac.new(SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return {"stripe-signature": f"t={timestamp},v1={signature}", "content-type": "application/json"}


@pytest.mark.parametrize("hours,as_host,expected", [(25, False, True), (24, False, False), (23, False, False), (1, True, True), (-1, True, True)])
def test_refund_policy_boundary(hours, as_host, expected):
    now = datetime.now(timezone.utc)
    booking = NS(price_cents=5000, starts_at=now + timedelta(hours=hours))
    assert P.refund_due(booking, as_host=as_host, now=now) is expected
    booking.price_cents = None
    assert P.refund_due(booking, as_host=as_host, now=now) is False


@pytest.mark.parametrize("price", [0, -1, 49, 50.5, True, 100000000])
def test_price_validation(price):
    with pytest.raises(ValidationError):
        EventTypeCreate(name="Call", duration=30, price_cents=price)
    with pytest.raises(ValidationError):
        EventTypeUpdate(price_cents=price)


def test_price_defaults_and_currency_validation():
    assert EventTypeCreate(name="Call", duration=30).price_cents is None
    assert EventTypeCreate(name="Call", duration=30).currency == "usd"
    assert EventTypeUpdate(price_cents=None).model_dump(exclude_unset=True) == {"price_cents": None}
    for currency in (None, "wat", "USD", "jpy"):
        with pytest.raises(ValidationError):
            EventTypeUpdate(currency=currency)


async def test_connect_signature_failure(monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", SECRET)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/webhooks/stripe-connect", content=b"{}", headers={"stripe-signature": "t=1,v1=bad"})
        assert response.status_code == 400
        body = json.dumps({"type": "ignored", "data": {"object": {}}}).encode()
        assert (await client.post("/api/webhooks/stripe-connect", content=body, headers=signed(body))).status_code == 200


async def test_onboarding_returns_to_booking_page_without_external_services(monkeypatch):
    from app.routers.connect import OnboardingRequest, connect_onboarding

    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", SECRET)
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://timeiq.example/")
    user = NS(id=uuid.uuid4(), stripe_connect_account_id="acct_test_host")
    db = NS(execute=AsyncMock(return_value=NS(scalar_one=lambda: user)))
    stripe_call = AsyncMock(return_value={"url": "https://connect.stripe.test/onboarding"})
    monkeypatch.setattr(P, "stripe_call", stripe_call)

    assert await connect_onboarding(OnboardingRequest(), user=user, db=db) == {
        "url": "https://connect.stripe.test/onboarding",
    }
    stripe_call.assert_awaited_once_with(
        stripe.AccountLink.create, account="acct_test_host", type="account_onboarding",
        return_url="https://timeiq.example/event-types?connect=return",
        refresh_url="https://timeiq.example/event-types?connect=refresh",
    )


class FakeStripe:
    def __init__(self, monkeypatch):
        self.account = {"id": "acct_test_host", "charges_enabled": True, "payouts_enabled": True}
        self.sessions = {}
        self.created = []
        self.refunds = []
        self.account_creates = []
        self.links = []
        self.login_accounts = []
        monkeypatch.setattr(stripe.Account, "retrieve", lambda *a, **kw: dict(self.account))
        monkeypatch.setattr(stripe.Account, "create", self.create_account)
        monkeypatch.setattr(stripe.Account, "create_login_link", self.login)
        monkeypatch.setattr(stripe.AccountLink, "create", self.link)
        monkeypatch.setattr(stripe.checkout.Session, "create", self.create)
        monkeypatch.setattr(stripe.checkout.Session, "retrieve", lambda sid, **kw: dict(self.sessions[sid]))
        monkeypatch.setattr(stripe.checkout.Session, "expire", self.expire)
        monkeypatch.setattr(stripe.Refund, "create", self.refund)

    def create_account(self, **kw):
        self.account_creates.append(kw)
        return self.account

    def login(self, account, **kw):
        self.login_accounts.append(account)
        return {"url": "https://connect.stripe.test/dashboard"}

    def link(self, **kw):
        self.links.append(kw)
        return {"url": "https://connect.stripe.test/onboarding"}

    def create(self, **kw):
        self.created.append(kw)
        sid = f"cs_test_{uuid.uuid4().hex}"
        price = kw["line_items"][0]["price_data"]
        session = {"id": sid, "url": f"https://checkout.stripe.test/{sid}", "status": "open", "payment_status": "unpaid",
                   "mode": "payment", "metadata": kw["metadata"], "amount_total": price["unit_amount"],
                   "currency": price["currency"], "payment_intent": None}
        self.sessions[sid] = session
        return session

    def pay(self, sid):
        self.sessions[sid].update(status="complete", payment_status="paid", payment_intent=f"pi_{sid}")
        return dict(self.sessions[sid])

    def expire(self, sid, **kw):
        self.sessions[sid]["status"] = "expired"
        return dict(self.sessions[sid])

    def refund(self, **kw):
        self.refunds.append(kw)
        return {"id": "re_test", "status": "succeeded"}


@pytest.fixture
async def env(monkeypatch):
    if not LOCAL_QA:
        pytest.skip("needs a local timeiq_qa* database")
    for key, value in {"STRIPE_SECRET_KEY": "sk_test_fake", "STRIPE_CONNECT_WEBHOOK_SECRET": SECRET,
                       "RESEND_API_KEY": "re_fake", "CRON_SECRET": "cron_test"}.items():
        monkeypatch.setattr(settings, key, value)
    fake = FakeStripe(monkeypatch)
    mail = []
    monkeypatch.setattr(resend.Emails, "send", lambda payload: mail.append(payload))

    async def no_sync(*a, **kw):
        return 0
    monkeypatch.setattr("app.routers.bookings.freshen_host_calendars", no_sync)
    monkeypatch.setattr("app.tasks.freshen_user_calendars", no_sync)

    def no_network(request):
        raise AssertionError(f"Unexpected external HTTP: {request.url.host}")
    original_init = httpx.AsyncClient.__init__

    def safe_init(self, *a, **kw):
        if not isinstance(kw.get("transport"), (httpx.ASGITransport, httpx.MockTransport)):
            kw["transport"] = httpx.MockTransport(no_network)
        original_init(self, *a, **kw)
    monkeypatch.setattr(httpx.AsyncClient, "__init__", safe_init)

    key = uuid.uuid4().hex
    async with async_session() as db:
        host = User(clerk_id=key, username=key, email="host@example.com", name="Host", timezone="UTC",
                    stripe_connect_account_id=fake.account["id"], stripe_connect_charges_enabled=True,
                    stripe_connect_payouts_enabled=True, subscription_status="active")
        db.add(host)
        await db.flush()
        event = EventType(user_id=host.id, name="Paid call", slug="call", duration_minutes=30, price_cents=5000, currency="usd")
        db.add(event)
        for day in range(7):
            db.add(AvailabilityRule(user_id=host.id, day_of_week=day, start_time=day_time(9), end_time=day_time(17), is_active=True))
        await db.commit()

    async def current_user(db=Depends(get_db)):
        return await db.get(User, host.id)
    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_current_user_unrestricted] = current_user
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield NS(client=client, host=host, event=event, fake=fake, mail=mail)
    app.dependency_overrides.clear()
    async with async_session() as db:
        await db.execute(delete(User).where(User.id == host.id))
        await db.commit()
    await engine.dispose()


def payload(**kw):
    start = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=10, minute=0, second=0, microsecond=0)
    return {"visitor_name": "Guest", "visitor_email": "guest@example.com", "starts_at": start.isoformat(), "timezone": "UTC", **kw}


async def book(env, **kw):
    response = await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload(**kw))
    assert response.status_code == 201, response.text
    async with async_session() as db:
        return await db.get(Booking, uuid.UUID(response.json()["id"]))


async def webhook(env, kind, obj, account="acct_test_host"):
    body = json.dumps({"type": kind, "account": account, "data": {"object": obj}}).encode()
    response = await env.client.post("/api/webhooks/stripe-connect", content=body, headers=signed(body))
    assert response.status_code == 200, response.text
    return response


async def pay(env, booking):
    await webhook(env, "checkout.session.completed", env.fake.pay(booking.stripe_checkout_session_id))


async def test_onboarding_status_country_links_and_account_updates(env):
    async with async_session() as db:
        user = await db.get(User, env.host.id)
        user.stripe_connect_account_id = None
        await db.commit()
    assert (await env.client.get("/api/connect/status")).json()["status"] == "not_connected"
    r = await env.client.post("/api/connect/onboarding", json={"country": "CA"})
    assert r.status_code == 200
    assert env.fake.account_creates[0]["country"] == "CA"
    assert env.fake.account_creates[0]["controller"]["losses"] == {"payments": "stripe"}
    assert "type" not in env.fake.account_creates[0]
    assert env.fake.links[0]["return_url"].endswith("/event-types?connect=return")
    assert env.fake.links[0]["refresh_url"].endswith("/event-types?connect=refresh")
    await env.client.post("/api/connect/onboarding", json={})
    assert len(env.fake.account_creates) == 1
    assert (await env.client.get("/api/connect/status")).json()["status"] == "ready"
    assert (await env.client.post("/api/connect/dashboard")).status_code == 200
    assert (await env.client.post("/api/connect/dashboard")).json()["url"] == "https://dashboard.stripe.com/"
    env.fake.account["charges_enabled"] = False
    await webhook(env, "account.updated", {"id": "acct_test_host", "charges_enabled": True, "payouts_enabled": True})
    assert (await env.client.get("/api/connect/status")).json()["status"] == "needs_info"
    assert (await env.client.get(f"/api/public/{env.host.username}")).json()["event_types"] == []
    blocked = await env.client.get(f"/api/public/{env.host.username}/call")
    assert blocked.status_code == 409 and "Contact the host" in blocked.json()["detail"]
    assert (await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload())).status_code == 409


async def test_pricing_guard_and_event_type_ownership(env):
    env.fake.account["payouts_enabled"] = False
    r = await env.client.post("/api/event-types", json={"name": "New", "duration": 30, "price_cents": 1000})
    assert r.status_code == 409
    assert (await env.client.patch(f"/api/event-types/{env.event.id}", json={"price_cents": 2500})).status_code == 409
    assert (await env.client.patch(f"/api/event-types/{uuid.uuid4()}", json={"price_cents": 2500})).status_code == 404
    env.fake.account["payouts_enabled"] = True
    r = await env.client.patch(f"/api/event-types/{env.event.id}", json={"price_cents": 2500, "currency": "eur"})
    assert r.status_code == 200 and r.json()["price_cents"] == 2500 and r.json()["currency"] == "eur"
    env.fake.account["charges_enabled"] = False
    assert (await env.client.patch(f"/api/event-types/{env.event.id}", json={"price_cents": None})).status_code == 200
    booking = await book(env)
    assert booking.status == "confirmed" and booking.price_cents is None
    assert env.fake.created == [] and len(env.mail) == 2


async def test_hold_then_verified_webhook_confirms_once(env):
    booking = await book(env)
    assert booking.status == "pending_payment" and env.mail == []
    created = env.fake.created[0]
    assert created["stripe_account"] == "acct_test_host" and created["mode"] == "payment"
    assert "application_fee_amount" not in created.get("payment_intent_data", {})
    assert created["metadata"] == {"booking_id": str(booking.id)}
    assert 1800 < created["expires_at"] - time.time() <= 1860
    profile = (await env.client.get(f"/api/public/{env.host.username}")).json()
    assert profile["event_types"][0]["price_cents"] == 5000
    slots = (await env.client.get(f"/api/public/{env.host.username}/call/slots?date={booking.starts_at.date()}")).json()
    assert booking.starts_at.isoformat() not in [s["start"] for s in slots]
    session = env.fake.pay(booking.stripe_checkout_session_id)
    await webhook(env, "checkout.session.completed", session, account="acct_someone_else")
    assert env.mail == []
    await webhook(env, "checkout.session.completed", session)
    await webhook(env, "checkout.session.completed", session)
    assert len(env.mail) == 2 and env.mail[0]["attachments"][0]["content_type"] == "text/calendar; method=REQUEST"
    assert "24 hours" in env.mail[0]["html"]
    r = await env.client.get(f"/api/public/bookings/{booking.id}/payment?token={booking.payment_token}")
    assert r.json()["status"] == "confirmed" and r.json()["checkout_url"] is None
    assert (await env.client.get(f"/api/public/bookings/{booking.id}/payment?token=wrong")).status_code == 404


async def test_double_book_race_creates_one_checkout(env):
    responses = await asyncio.gather(*[env.client.post(f"/api/public/{env.host.username}/call/book", json=payload(visitor_email=f"guest{i}@example.com")) for i in range(6)])
    assert sorted(r.status_code for r in responses) == [201] + [409] * 5
    assert len(env.fake.created) == 1 and env.mail == []


async def test_email_cancellation_and_public_reschedule_share_lock_order(env, monkeypatch):
    from app.services import booking_agent, meeting_agent

    booking = await book(env)
    await pay(env, booking)
    email_locked = asyncio.Event()
    booking_locked = asyncio.Event()
    limit = P.limit_booking_emails
    find = booking_agent.find_booking

    async def limit_with_barrier(db, email, *, cancellation=False):
        await limit(db, email, cancellation=cancellation)
        if not cancellation:
            email_locked.set()
            await booking_locked.wait()

    async def find_with_barrier(*args):
        found = await find(*args)
        booking_locked.set()
        return found

    monkeypatch.setattr(P, "limit_booking_emails", limit_with_barrier)
    monkeypatch.setattr(booking_agent, "find_booking", find_with_barrier)
    monkeypatch.setattr(booking_agent, "read_action", AsyncMock(return_value=booking_agent.BookingAction(intent="cancel")))
    monkeypatch.setattr(meeting_agent, "claim_message", AsyncMock(return_value=True))

    async def cancel_by_email():
        await email_locked.wait()
        async with async_session() as db:
            owner = await db.get(User, env.host.id)
            return await booking_agent.handle(db, owner, {
                "to": [booking_agent.reply_address(booking)], "authentication": {"dmarc": "pass"},
                "text": "Please cancel", "message_id": f"<{uuid.uuid4()}@example.com>",
            }, booking.visitor_email, [], datetime.now(timezone.utc))

    response, outcome = await asyncio.wait_for(asyncio.gather(
        env.client.post(f"/api/public/bookings/{booking.id}/reschedule?token={booking.cancel_token}",
                        json=payload(starts_at=(booking.starts_at + timedelta(hours=1)).isoformat())),
        cancel_by_email(),
    ), timeout=5)
    assert response.status_code in (201, 400), response.text
    assert outcome in ("meeting_cancelled", "ignored")
    assert (response.status_code == 201) == (outcome == "ignored")


async def test_expiry_closes_checkout_before_releasing_slot(env):
    booking = await book(env)
    async with async_session() as db:
        stored = await db.get(Booking, booking.id)
        stored.payment_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    response = await env.client.get("/api/cron/expire-booking-payments", headers={"authorization": "Bearer cron_test"})
    assert response.status_code == 200 and response.json()["processed"] == 1
    assert env.fake.sessions[booking.stripe_checkout_session_id]["status"] == "expired"
    replacement = await book(env)
    assert replacement.status == "pending_payment" and env.mail == []
    # A late successful event for the released hold is refunded, never confirmed.
    await pay(env, booking)
    assert len(env.fake.refunds) == 1 and env.mail == []


async def test_expired_webhook_releases_hold(env):
    booking = await book(env)
    await webhook(env, "checkout.session.expired", env.fake.expire(booking.stripe_checkout_session_id))
    await book(env)
    assert len(env.fake.created) == 2 and env.mail == []


async def test_payment_racing_expiry_stays_booked(env, monkeypatch):
    booking = await book(env)
    async with async_session() as db:
        stored = await db.get(Booking, booking.id)
        stored.payment_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()

    def pay_instead(sid, **kw):
        env.fake.pay(sid)
        raise stripe.InvalidRequestError("Already complete", "session")
    monkeypatch.setattr(stripe.checkout.Session, "expire", pay_instead)
    response = await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload())
    assert response.status_code == 409
    assert len(env.mail) == 2 and env.fake.refunds == []


@pytest.mark.parametrize("as_host,hours,refunded", [(True, 1, True), (False, 25, True), (False, 24, False), (False, 23, False)])
async def test_cancellation_refund_policy_and_idempotency(env, as_host, hours, refunded):
    booking = await book(env)
    await pay(env, booking)
    async with async_session() as db:
        stored = await db.get(Booking, booking.id)
        stored.starts_at = datetime.now(timezone.utc) + timedelta(hours=hours)
        await db.commit()
    if as_host:
        response = await env.client.patch(f"/api/bookings/{booking.id}")
    else:
        response = await env.client.post(f"/api/public/bookings/{booking.id}/cancel?token={booking.cancel_token}")
    assert response.status_code == 200, response.text
    assert bool(env.fake.refunds) is refunded
    if refunded:
        assert env.fake.refunds[0]["stripe_account"] == "acct_test_host"
        assert "full refund" in env.mail[-1]["html"]
    else:
        assert "will not be refunded" in env.mail[-1]["html"]
    assert (await env.client.post(f"/api/public/bookings/{booking.id}/cancel?token={booking.cancel_token}")).status_code == 400
    await pay(env, booking)
    assert len(env.fake.refunds) == int(refunded)
    assert len(env.mail) == 4


async def test_reschedule_keeps_payment_and_does_not_refund_old_webhook(env):
    booking = await book(env)
    await pay(env, booking)
    # A later event price edit must not change the guest's original payment.
    await env.client.patch(f"/api/event-types/{env.event.id}", json={"price_cents": 8000})
    new_start = (booking.starts_at + timedelta(hours=1)).isoformat()
    response = await env.client.post(f"/api/public/bookings/{booking.id}/reschedule?token={booking.cancel_token}", json=payload(starts_at=new_start))
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "confirmed" and response.json()["price_cents"] == 5000
    await pay(env, booking)
    assert env.fake.refunds == [] and len(env.fake.created) == 1
    assert (await env.client.patch(f"/api/bookings/{response.json()['id']}")).status_code == 200
    assert env.fake.refunds[0]["payment_intent"] == f"pi_{booking.stripe_checkout_session_id}"


async def test_public_email_rate_limit(env):
    async with async_session() as db:
        for _ in range(10):
            db.add(Booking(event_type_id=env.event.id, host_user_id=env.host.id, visitor_name="Guest",
                           visitor_email="guest@example.com", starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                           ends_at=datetime.now(timezone.utc) - timedelta(hours=23), timezone="UTC", status="cancelled"))
        await db.commit()
    response = await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload())
    assert response.status_code == 429 and env.fake.created == [] and env.mail == []


@pytest.mark.parametrize("changes", [{"amount_total": 1}, {"currency": "eur"}, {"payment_status": "unpaid"}, {"mode": "subscription"}, {"metadata": {"booking_id": str(uuid.uuid4())}}])
async def test_webhook_rejects_wrong_payment_details(env, changes):
    booking = await book(env)
    session = env.fake.pay(booking.stripe_checkout_session_id)
    await webhook(env, "checkout.session.completed", {**session, **changes})
    async with async_session() as db:
        assert (await db.get(Booking, booking.id)).status == "pending_payment"
    assert env.mail == []


async def test_refund_failure_keeps_booking_for_retry(env, monkeypatch):
    booking = await book(env)
    await pay(env, booking)

    def unavailable(**kw):
        raise stripe.APIConnectionError("Offline")
    monkeypatch.setattr(stripe.Refund, "create", unavailable)
    response = await env.client.patch(f"/api/bookings/{booking.id}")
    assert response.status_code == 502
    async with async_session() as db:
        assert (await db.get(Booking, booking.id)).status == "confirmed"
    assert len(env.mail) == 2
    monkeypatch.setattr(stripe.Refund, "create", env.fake.refund)
    assert (await env.client.patch(f"/api/bookings/{booking.id}")).status_code == 200


async def test_expiry_outage_keeps_hold_busy(env, monkeypatch):
    booking = await book(env)
    async with async_session() as db:
        stored = await db.get(Booking, booking.id)
        stored.payment_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()

    def unavailable(*a, **kw):
        raise stripe.APIConnectionError("Offline")
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", unavailable)
    response = await env.client.get("/api/cron/expire-booking-payments", headers={"authorization": "Bearer cron_test"})
    assert response.status_code == 502
    async with async_session() as db:
        assert (await db.get(Booking, booking.id)).status == "pending_payment"
    assert env.fake.created and len(env.fake.created) == 1 and env.mail == []


async def test_cancel_and_reschedule_require_ownership(env):
    booking = await book(env)
    assert (await env.client.patch(f"/api/bookings/{uuid.uuid4()}")).status_code == 404
    assert (await env.client.post(f"/api/public/bookings/{booking.id}/cancel?token=wrong")).status_code == 404
    assert (await env.client.post(f"/api/public/bookings/{booking.id}/reschedule?token=wrong", json=payload())).status_code == 404
    assert env.fake.refunds == [] and env.mail == []


async def test_free_bookings_work_without_connect(env, monkeypatch):
    await env.client.patch(f"/api/event-types/{env.event.id}", json={"price_cents": None})
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "")
    booking = await book(env)
    assert booking.status == "confirmed" and env.fake.created == [] and len(env.mail) == 2


async def test_account_link_retry_reuses_saved_account(env, monkeypatch):
    async with async_session() as db:
        user = await db.get(User, env.host.id)
        user.stripe_connect_account_id = None
        await db.commit()

    def unavailable(**kw):
        raise stripe.APIConnectionError("Offline")
    monkeypatch.setattr(stripe.AccountLink, "create", unavailable)
    assert (await env.client.post("/api/connect/onboarding", json={})).status_code == 502
    monkeypatch.setattr(stripe.AccountLink, "create", env.fake.link)
    assert (await env.client.post("/api/connect/onboarding", json={})).status_code == 200
    assert len(env.fake.account_creates) == 1 and env.fake.account_creates[0]["country"] == "US"


async def test_holds_use_daily_caps_and_buffers_across_event_types(env):
    await env.client.patch(f"/api/event-types/{env.event.id}", json={"max_bookings_per_day": 1, "buffer_time": 30})
    booking = await book(env)
    free = await env.client.post("/api/event-types", json={"name": "Free call", "duration": 30})
    assert free.status_code == 201
    near = (booking.starts_at + timedelta(minutes=30)).isoformat()
    response = await env.client.post(f"/api/public/{env.host.username}/{free.json()['slug']}/book", json=payload(starts_at=near))
    assert response.status_code == 409
    later = (booking.starts_at + timedelta(hours=3)).isoformat()
    response = await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload(starts_at=later))
    assert response.status_code == 409
    await webhook(env, "checkout.session.expired", env.fake.expire(booking.stripe_checkout_session_id))
    assert (await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload(starts_at=later))).status_code == 201


async def test_checkout_failure_does_not_leave_a_slot_hold(env, monkeypatch):
    def unavailable(**kw):
        raise stripe.APIConnectionError("Offline")
    monkeypatch.setattr(stripe.checkout.Session, "create", unavailable)
    response = await env.client.post(f"/api/public/{env.host.username}/call/book", json=payload())
    assert response.status_code == 502
    async with async_session() as db:
        assert (await db.execute(select(Booking).where(Booking.host_user_id == env.host.id))).scalars().all() == []
    assert env.mail == []


async def test_public_cancellation_email_rate_limit_allows_host_refund(env):
    booking = await book(env)
    await pay(env, booking)
    async with async_session() as db:
        for _ in range(10):
            db.add(Booking(event_type_id=env.event.id, host_user_id=env.host.id, visitor_name="Guest",
                           visitor_email="guest@example.com", starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                           ends_at=datetime.now(timezone.utc) - timedelta(hours=23), timezone="UTC", status="cancelled",
                           cancelled_at=datetime.now(timezone.utc), created_at=datetime.now(timezone.utc) - timedelta(days=1)))
        await db.commit()
    response = await env.client.post(f"/api/public/bookings/{booking.id}/cancel?token={booking.cancel_token}")
    assert response.status_code == 429 and env.fake.refunds == [] and len(env.mail) == 2
    assert (await env.client.patch(f"/api/bookings/{booking.id}")).status_code == 200
    assert len(env.fake.refunds) == 1
