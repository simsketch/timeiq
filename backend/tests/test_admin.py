import os
import re

import httpx
import pytest
from fastapi import Request
from sqlalchemy import func, select

from app.auth import get_current_user_clerk_id
from app.database import async_session
from app.main import app
from app.models.user import User
from tests.test_qa_db_races import env  # noqa: F401

pytestmark = pytest.mark.skipif(
    not re.search(r"@(localhost|127\.0\.0\.1)(:\d+)?/", os.environ.get("DATABASE_URL", "")),
    reason="needs a local Postgres in DATABASE_URL",
)


def clerk(monkeypatch, *, email="simsketch@gmail.com", verified=True, primary=True):
    original = httpx.AsyncClient.__init__

    def respond(request):
        assert request.url.host == "api.clerk.com"
        return httpx.Response(200, json={
            "primary_email_address_id": "owner" if primary else "other",
            "email_addresses": [{"id": "owner", "email_address": email,
                                 "verification": {"status": "verified" if verified else "unverified"}}],
        })

    def init(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(respond)
        original(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", init)


@pytest.mark.asyncio
@pytest.mark.parametrize("email,verified,primary", [
    ("other@example.com", True, True), ("simsketch@gmail.com", False, True),
    ("simsketch@gmail.com", True, False),
])
async def test_admin_refuses_other_unverified_or_secondary_email(env, monkeypatch, email, verified, primary):
    clerk(monkeypatch, email=email, verified=verified, primary=primary)
    r = await env.client.get("/api/admin/analytics")
    assert r.status_code == 403
    assert "recent_users" not in r.text
    assert (await env.client.get("/api/admin/ads")).status_code == 403


@pytest.mark.asyncio
async def test_admin_verified_owner_counts_and_private_response(env, monkeypatch):
    env.client._transport.raise_app_exceptions = True
    clerk(monkeypatch, email="SIMSKETCH@gmail.com")
    r = await env.client.get("/api/admin/analytics")
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "private, no-store"
    data = r.json()
    async with async_session() as db:
        assert data["users"]["total"] == await db.scalar(select(func.count()).select_from(User))
    assert data["users"]["last_24h"] >= 3
    assert len(data["signups"]) == 30
    assert data["signups"][-1]["count"] >= 3
    assert data["activity"]["connected_calendars"] >= 0
    assert any(u["email"] == env.users[0].email for u in data["recent_users"])
    assert "clerk_id" not in r.text and "booking_logo" not in r.text


@pytest.mark.asyncio
async def test_admin_refuses_api_tokens_and_anonymous(env):
    def token(request: Request):
        request.state.auth_method = "token"
        return env.users[0].clerk_id
    app.dependency_overrides[get_current_user_clerk_id] = token
    assert (await env.client.get("/api/admin/analytics")).status_code == 403
    app.dependency_overrides.clear()
    assert (await env.client.get("/api/admin/analytics")).status_code == 401


@pytest.mark.asyncio
async def test_attribution_is_first_write_only_and_owner_can_see_source(env, monkeypatch):
    from datetime import datetime, timezone
    payload = {"utm_source": "facebook", "utm_medium": "paid", "utm_campaign": "founder100", "utm_content": "G-all-calendars", "captured_at": datetime.now(timezone.utc).isoformat()}
    r = await env.client.post("/api/me/attribution", json=payload)
    assert r.status_code == 200, r.text
    assert r.json() == {"recorded": True}
    assert (await env.client.post("/api/me/attribution", json={**payload, "utm_content": "later-ad"})).json() == {"recorded": False}
    clerk(monkeypatch)
    r = await env.client.get("/api/admin/analytics")
    assert r.status_code == 200, r.text
    assert any(source["ad"] == "G-all-calendars" and source["users"] >= 1 for source in r.json()["acquisition"])


@pytest.mark.asyncio
async def test_attribution_refuses_old_accounts_and_bad_payloads(env):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update
    now = datetime.now(timezone.utc)
    payload = {"utm_source": "facebook", "captured_at": now.isoformat()}
    async with async_session() as db:
        await db.execute(update(User).where(User.id == env.users[0].id).values(created_at=now-timedelta(days=100)))
        await db.commit()
    assert (await env.client.post("/api/me/attribution", json=payload)).json() == {"recorded": False}
    assert (await env.client.post("/api/me/attribution", json={**payload, "utm_source": "x"*161})).status_code == 422
    assert (await env.client.post("/api/me/attribution", json={**payload, "ad_id": "not-an-id"})).status_code == 422


@pytest.mark.asyncio
async def test_ads_endpoint_periods_ownership_and_error_isolation(env, monkeypatch):
    from app.services import ad_performance
    clerk(monkeypatch)
    periods = []
    async def report(days):
        periods.append(days)
        return {"timezone": "America/New_York", "since": "2026-01-01", "until": "2027-01-01", "totals": {}, "ads": [{"id": "123", "name": "G-all-calendars"}]}
    monkeypatch.setattr(ad_performance, "fetch_report", report)
    for days in (7, 30, 0):
        r = await env.client.get(f"/api/admin/ads?days={days}")
        assert r.status_code == 200, r.text
        assert r.headers["cache-control"] == "private, no-store"
        assert r.json()["totals"]["attributed_users"] == 0
    assert periods == [7, 30, 0]
    assert (await env.client.get("/api/admin/ads?days=8")).status_code == 422
