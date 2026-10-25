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
    monkeypatch.setattr(resend.Emails, "send", lambda payload: mail.append(payload) or {"id": "m"})
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
    assert sorted(r.json()["number"] for r in rs) == ["INV-0001", "INV-0002", "INV-0003"]


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
    calls = []
    monkeypatch.setattr(stripe.checkout.Session, "create", lambda **kw: calls.append(kw) or {"url": "https://x"})
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
