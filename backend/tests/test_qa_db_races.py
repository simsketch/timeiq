"""Database-backed regressions for QA-003/020/021/022/023.

These need a real Postgres (row locks, advisory locks), so they run only when
DATABASE_URL points at a local database and are skipped everywhere else. No
external service is contacted: Stripe, Resend and Clerk are mocked, and any
other outbound HTTP fails the test.
"""
from __future__ import annotations

import asyncio
import os
import re
import uuid
from types import SimpleNamespace as NS

import httpx
import pytest
import pytest_asyncio
import resend
import stripe
from sqlalchemy import delete

from app.auth import get_current_user_clerk_id
from app.config import settings
from app.database import async_session, engine
from app.main import app
from app.models.user import User
from app.services import billing

pytestmark = pytest.mark.skipif(
    not re.search(r"@(localhost|127\.0\.0\.1)(:\d+)?/", os.environ.get("DATABASE_URL", "")),
    reason="needs a local Postgres in DATABASE_URL",
)


@pytest_asyncio.fixture
async def env(monkeypatch):
    key = uuid.uuid4().hex[:10]
    async with async_session() as db:
        users = [
            User(clerk_id=f"rt_{key}_{i}", username=f"rt_{key}_{i}", email=f"rt{i}@example.com",
                 name=f"RT {i}", subscription_status=status)
            for i, status in enumerate(["active", "none", "none"])
        ]
        db.add_all(users)
        await db.commit()

    mail: list = []
    monkeypatch.setattr(resend.Emails, "send", lambda payload, **kw: mail.append(payload) or {"id": "m"})
    for name, value in {
        "RESEND_API_KEY": "re_fake", "STRIPE_SECRET_KEY": "sk_test_fake",
        "STRIPE_PRICE_FOUNDER": "price_founder", "STRIPE_PRICE_STANDARD": "price_standard",
        "FRONTEND_URL": "http://localhost:3000",
    }.items():
        monkeypatch.setattr(settings, name, value)

    def no_network(request):
        raise AssertionError(f"unexpected outbound HTTP {request.url}")

    original_init = httpx.AsyncClient.__init__

    def safe_init(self, *args, **kwargs):
        if not isinstance(kwargs.get("transport"), (httpx.ASGITransport, httpx.MockTransport)):
            kwargs["transport"] = httpx.MockTransport(no_network)
        original_init(self, *args, **kwargs)
    monkeypatch.setattr(httpx.AsyncClient, "__init__", safe_init)

    def as_user(u):
        app.dependency_overrides[get_current_user_clerk_id] = lambda: u.clerk_id
    as_user(users[0])
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        yield NS(client=client, users=users, mail=mail, as_user=as_user)
    app.dependency_overrides.clear()
    async with async_session() as db:
        await db.execute(delete(User).where(User.clerk_id.like(f"rt_{key}_%")))
        await db.commit()
    await engine.dispose()


async def _client(c, currency="USD", name="Acme"):
    r = await c.post("/api/clients", json={"name": name, "hourly_rate": "100", "currency": currency,
                                           "billing_email": "billing@example.com"})
    assert r.status_code == 201, r.text
    client = r.json()
    r = await c.post("/api/time-entries", json={"client_id": client["id"], "entry_date": "2026-10-05",
                                                "hours": "1.00", "description": "Work"})
    assert r.status_code == 201, r.text
    return client


async def _draft(c, client):
    r = await c.post("/api/invoices", json={"client_id": client["id"], "period_start": "2026-10-01",
                                            "period_end": "2026-10-31"})
    assert r.status_code == 201, r.text
    return r.json()


async def test_parallel_invoice_creation_gets_distinct_numbers(env):
    clients = [await _client(env.client, name=f"C{i}") for i in range(3)]
    rs = await asyncio.gather(*[
        env.client.post("/api/invoices", json={"client_id": c["id"], "period_start": "2026-10-01",
                                               "period_end": "2026-10-31"})
        for c in clients
    ])
    assert [r.status_code for r in rs] == [201, 201, 201], [r.text for r in rs]
    assert sorted(r.json()["number"] for r in rs) == ["INV-0101", "INV-0102", "INV-0103"]


async def test_parallel_invoices_never_bill_the_same_hours(env):
    client = await _client(env.client)
    rs = await asyncio.gather(*[
        env.client.post("/api/invoices", json={"client_id": client["id"], "period_start": "2026-10-01",
                                               "period_end": "2026-10-31"})
        for _ in range(3)
    ])
    assert sorted(r.status_code for r in rs) == [201, 400, 400], [r.text for r in rs]


async def test_edit_waits_for_a_send_and_then_sees_it(env):
    from app.services.invoicing_ops import lock_billing
    from app.models.invoice import Invoice
    inv = await _draft(env.client, await _client(env.client))
    entry_id = inv["lines"][0]["time_entry_id"]
    async with async_session() as db:  # a send in flight: billing lock held, status flipped
        await lock_billing(db, env.users[0].id)
        (await db.get(Invoice, uuid.UUID(inv["id"]))).status = "sent"
        await db.flush()
        edit = asyncio.create_task(env.client.patch(f"/api/time-entries/{entry_id}", json={"hours": "2.00"}))
        await asyncio.sleep(0.5)
        assert not edit.done()  # queued behind the send
        await db.commit()
    r = await edit
    assert r.status_code == 409, r.text
    assert (await env.client.get(f"/api/invoices/{inv['id']}")).json()["subtotal"] in ("100.00", 100, "100")


async def test_overlapping_sends_deliver_once_but_later_resend_works(env, monkeypatch):
    inv = await _draft(env.client, await _client(env.client))
    rs = await asyncio.gather(*[env.client.post(f"/api/invoices/{inv['id']}/send") for _ in range(4)])
    assert all(r.status_code == 200 for r in rs)
    assert len(env.mail) == 1

    # A deliberate resend after the duplicate window still goes out.
    from app.routers import invoices
    monkeypatch.setattr(invoices, "DUPLICATE_SEND_WINDOW", invoices.timedelta(0))
    assert (await env.client.post(f"/api/invoices/{inv['id']}/send")).status_code == 200
    assert len(env.mail) == 2


async def test_dashboard_keeps_currencies_apart(env):
    await _client(env.client, "USD", "US client")
    await _client(env.client, "EUR", "EU client")
    body = (await env.client.get("/api/dashboard/money")).json()
    assert body["currency"] == "USD" and body["unbilled_amount"] == 100
    assert [(m["currency"], m["unbilled_amount"]) for m in body["by_currency"]] == [("USD", 100), ("EUR", 100)]


async def test_founder_seat_is_held_during_checkout(env, monkeypatch):
    billing._price_cache.clear()
    monkeypatch.setattr(stripe.Price, "retrieve", lambda p: {"unit_amount": 1900, "currency": "usd", "recurring": {"interval": "month"}})
    monkeypatch.setattr(stripe.Customer, "create", lambda **kw: {"id": "cus_" + kw["metadata"]["timeiq_user_id"]})
    calls, expired = [], []
    monkeypatch.setattr(stripe.Subscription, "list", lambda **kw: {"data": []})

    def create(**kw):
        calls.append(kw)
        return {"id": f"cs_{len(calls)}", "url": "https://x"}
    monkeypatch.setattr(stripe.checkout.Session, "create", create)
    monkeypatch.setattr(stripe.checkout.Session, "list", lambda **kw: {"data": [
        {"id": f"cs_{i}", "mode": "subscription"} for i, c in enumerate(calls, 1)
        if c["customer"] == kw["customer"] and f"cs_{i}" not in expired]})
    monkeypatch.setattr(stripe.checkout.Session, "expire", lambda sid: expired.append(sid))
    async with async_session() as db:  # leave exactly one seat, whatever the DB already holds
        before = await billing.founder_seats_taken(db)
    monkeypatch.setattr(settings, "FOUNDER_SEATS", before + 1)

    first, second = env.users[1], env.users[2]
    env.as_user(first)
    assert (await env.client.post("/api/billing/checkout")).status_code == 200
    assert (await env.client.get("/api/billing/pricing")).json()["founder_seats_left"] == 0
    env.as_user(second)
    assert (await env.client.post("/api/billing/checkout")).status_code == 200
    env.as_user(first)  # reopening checkout keeps the seat already held
    assert (await env.client.post("/api/billing/checkout")).status_code == 200

    prices = [c["line_items"][0]["price"] for c in calls]
    assert prices == ["price_founder", "price_standard", "price_founder"]
    assert "expires_at" in calls[0] and "expires_at" not in calls[1]
    assert expired == ["cs_1"]  # the reopened checkout replaced the first one


async def test_first_checkout_gets_the_trial_and_a_returning_one_does_not(env, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_PRICE_FOUNDER", "")
    monkeypatch.setattr(stripe.Customer, "create", lambda **kw: {"id": f"cus_{kw['metadata']['timeiq_user_id']}"})
    monkeypatch.setattr(stripe.checkout.Session, "list", lambda **kw: {"data": []})
    history: dict = {"data": []}
    monkeypatch.setattr(stripe.Subscription, "list", lambda **kw: history)
    calls = []
    monkeypatch.setattr(stripe.checkout.Session, "create", lambda **kw: calls.append(kw) or {"id": "cs", "url": "https://x"})
    env.as_user(env.users[1])
    assert (await env.client.post("/api/billing/checkout")).status_code == 200
    assert calls[-1]["subscription_data"]["trial_period_days"] == billing.TRIAL_DAYS
    assert calls[-1]["payment_method_collection"] == "always"
    history["data"] = [{"id": "sub_old", "status": "canceled", "created": 1}]  # subscribed before
    assert (await env.client.post("/api/billing/checkout")).status_code == 200
    assert "trial_period_days" not in calls[-1]["subscription_data"]


async def test_trial_ending_reminder_is_sent_once_per_trial(env, monkeypatch):
    from datetime import datetime, timezone
    async with async_session() as db:
        u = await db.get(User, env.users[1].id)
        u.stripe_subscription_id, u.subscription_status = "sub_trial", "trialing"
        await db.commit()
    sent = []
    monkeypatch.setattr(resend.Emails, "send", lambda payload, **kw: sent.append((payload, kw)))
    end = int(datetime(2026, 11, 7, 15, tzinfo=timezone.utc).timestamp())
    sub = {"id": "sub_trial", "status": "trialing", "trial_end": end, "customer": "cus_x",
           "items": {"data": [{"price": {"unit_amount": 1900, "currency": "usd", "recurring": {"interval": "year"}}}]}}
    await billing._remind_trial_ending(sub, "cus_x")
    payload, kw = sent[0]
    assert payload["to"] == [env.users[1].email] and payload["subject"] == "Your TimeIQ trial ends November 7"
    assert "$19.00 for a year" in payload["html"]
    assert kw["options"]["idempotency_key"] == f"trial-ending/sub_trial/{end}"
    await billing._remind_trial_ending({**sub, "cancel_at_period_end": True}, "cus_x")
    assert len(sent) == 1  # cancelled before the charge: no reminder


async def test_checkout_picks_up_a_subscription_paid_in_another_tab(env, monkeypatch):
    user = env.users[1]
    monkeypatch.setattr(stripe.Customer, "create", lambda **kw: {"id": "cus_tab"})
    monkeypatch.setattr(stripe.Subscription, "list", lambda **kw: {"data": [
        {"id": "sub_tab", "status": "active", "customer": "cus_tab", "created": 1,
         "items": {"data": [{"price": {"id": "price_standard"}, "current_period_end": 2000000000}]}}]})
    monkeypatch.setattr(stripe.checkout.Session, "create", lambda **kw: pytest.fail("second checkout created"))
    monkeypatch.setattr(settings, "STRIPE_PRICE_FOUNDER", "")
    env.as_user(user)
    assert (await env.client.post("/api/billing/checkout")).status_code == 409
    async with async_session() as db:
        stored = await db.get(User, user.id)
        assert (stored.stripe_subscription_id, stored.subscription_status) == ("sub_tab", "active")


async def test_account_survives_failed_stripe_cancel(env, monkeypatch):
    async with async_session() as db:
        u = await db.get(User, env.users[0].id)
        u.stripe_subscription_id = f"sub_{uuid.uuid4().hex[:8]}"
        await db.commit()

    def down(*a, **k):
        raise stripe.APIConnectionError("down")
    monkeypatch.setattr(stripe.Subscription, "cancel", down)
    r = await env.client.delete("/api/me")
    assert r.status_code == 502
    assert (await env.client.get("/api/me")).status_code == 200
