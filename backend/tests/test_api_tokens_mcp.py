"""Personal access tokens and the MCP server, against a real database.

Only runs when DATABASE_URL points at a local throwaway timeiq_qa* database.
"""
from __future__ import annotations

import json
import re
import uuid

import pytest

from app.config import settings

if not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url):
    pytest.skip("needs a local timeiq_qa* database", allow_module_level=True)

import httpx  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.auth import get_current_user_clerk_id  # noqa: E402
from app.database import async_session, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.models.api_token import ApiToken  # noqa: E402

ACCEPT = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25"}


@pytest.fixture
async def env():
    async with async_session() as db:
        user = User(clerk_id=f"user_{uuid.uuid4().hex[:20]}", email="tok@example.com",
                    username=f"tok{uuid.uuid4().hex[:8]}", name="Token Tester", timezone="America/New_York",
                    subscription_status="active")
        db.add(user)
        await db.commit()
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    try:
        yield {"user": user, "client": client}
    finally:
        app.dependency_overrides.clear()
        await client.aclose()
        async with async_session() as db:
            await db.execute(delete(User).where(User.id == user.id))
            await db.commit()
        await engine.dispose()


async def _create_token(env) -> dict:
    # Creating a token needs a signed-in session, so stand in for Clerk here.
    app.dependency_overrides[get_current_user_clerk_id] = lambda: env["user"].clerk_id
    r = await env["client"].post("/api/me/tokens", json={"name": "Laptop"})
    app.dependency_overrides.clear()
    assert r.status_code == 201, r.text
    return r.json()


async def _rpc(env, token: str, method: str, params: dict | None = None):
    return await env["client"].post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        headers={**ACCEPT, "Authorization": f"Bearer {token}"},
    )


async def test_token_is_shown_once_and_stored_hashed(env):
    created = await _create_token(env)
    assert created["token"].startswith("tiq_") and len(created["token"]) > 40
    assert created["prefix"] == created["token"][:8]
    async with async_session() as db:
        row = await db.get(ApiToken, uuid.UUID(created["id"]))
    assert row.token_hash != created["token"] and len(row.token_hash) == 64


async def test_token_authenticates_the_api_but_not_token_or_account_management(env):
    token = (await _create_token(env))["token"]
    auth = {"Authorization": f"Bearer {token}"}
    me = await env["client"].get("/api/me", headers=auth)
    assert me.status_code == 200 and me.json()["username"] == env["user"].username
    assert (await env["client"].post("/api/me/tokens", json={"name": "x"}, headers=auth)).status_code == 403
    assert (await env["client"].get("/api/me/tokens", headers=auth)).status_code == 403
    assert (await env["client"].delete("/api/me", headers=auth)).status_code == 403


async def test_revoked_and_unknown_tokens_are_refused(env):
    created = await _create_token(env)
    app.dependency_overrides[get_current_user_clerk_id] = lambda: env["user"].clerk_id
    assert (await env["client"].delete(f"/api/me/tokens/{created['id']}")).status_code == 204
    listed = await env["client"].get("/api/me/tokens")
    app.dependency_overrides.clear()
    assert listed.json() == []
    for bad in (created["token"], "tiq_" + "x" * 43):
        assert (await env["client"].get("/api/me", headers={"Authorization": f"Bearer {bad}"})).status_code == 401
        assert (await _rpc(env, bad, "tools/list")).status_code == 401


async def test_another_users_token_cant_revoke_mine(env):
    mine = await _create_token(env)
    async with async_session() as db:
        other = User(clerk_id=f"user_{uuid.uuid4().hex[:20]}", email="o@example.com", username=f"o{uuid.uuid4().hex[:8]}")
        db.add(other)
        await db.commit()
    try:
        app.dependency_overrides[get_current_user_clerk_id] = lambda: other.clerk_id
        assert (await env["client"].delete(f"/api/me/tokens/{mine['id']}")).status_code == 404
    finally:
        app.dependency_overrides.clear()
        async with async_session() as db:
            await db.execute(delete(User).where(User.id == other.id))
            await db.commit()


async def test_mcp_requires_a_token(env):
    r = await env["client"].post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers=ACCEPT)
    assert r.status_code == 401 and "WWW-Authenticate" in r.headers


async def test_mcp_lists_tools_and_calls_them_as_the_token_owner(env):
    token = (await _create_token(env))["token"]
    init = await _rpc(env, token, "initialize", {
        "protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"},
    })
    assert init.status_code == 200, init.text
    tools = (await _rpc(env, token, "tools/list")).json()["result"]["tools"]
    names = {t["name"] for t in tools}
    assert {"get_profile", "get_free_times", "find_time_with", "import_schedule_text", "log_time", "send_invoice"} <= names
    outward = {t["name"] for t in tools if (t.get("annotations") or {}).get("destructiveHint")}
    assert {"send_invoice", "book_group_meeting", "cancel_booking", "find_time_with"} <= outward

    called = (await _rpc(env, token, "tools/call", {"name": "get_profile", "arguments": {}})).json()["result"]
    profile = json.loads(called["content"][0]["text"])
    assert profile["username"] == env["user"].username
    assert profile["booking_link"].endswith(f"/book/{env['user'].username}")

    # API errors come back as tool errors with the API's own message.
    missing = (await _rpc(env, token, "tools/call", {"name": "send_invoice", "arguments": {"invoice_id": str(uuid.uuid4())}})).json()["result"]
    assert missing["isError"] and "Invoice not found" in missing["content"][0]["text"]


async def test_mcp_tools_respect_the_subscription_gate(env, monkeypatch):
    from app.services import billing

    token = (await _create_token(env))["token"]
    async with async_session() as db:
        user = await db.get(User, env["user"].id)
        user.subscription_status = "canceled"
        await db.commit()
    monkeypatch.setattr(billing, "enabled", lambda: True)
    result = (await _rpc(env, token, "tools/call", {"name": "list_bookings", "arguments": {}})).json()["result"]
    assert result["isError"] and "subscription" in result["content"][0]["text"]
