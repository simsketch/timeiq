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
