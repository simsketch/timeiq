"""The in-app assistant's one-off tool tokens and its endpoint's guards."""
from __future__ import annotations

import re
import time
import uuid
from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import assistant


def test_token_lives_only_inside_the_request():
    user = SimpleNamespace(clerk_id="user_abc")
    with assistant.request_token(user) as token:
        assert assistant.looks_like_token(token)
        assert assistant.clerk_id_for(token) == "user_abc"
    assert assistant.clerk_id_for(token) is None


def test_expired_or_unknown_token_is_refused(monkeypatch):
    user = SimpleNamespace(clerk_id="user_abc")
    with assistant.request_token(user) as token:
        now = time.monotonic()
        monkeypatch.setattr(assistant.time, "monotonic", lambda: now + assistant.TIME_BUDGET + 60)
        assert assistant.clerk_id_for(token) is None
    assert assistant.clerk_id_for("tiqa_not-a-real-token") is None


DB = re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url)


@pytest.fixture
async def env():
    if not DB:
        pytest.skip("needs a local timeiq_qa* database")
    import httpx
    from sqlalchemy import delete

    from app.database import async_session, engine
    from app.main import app
    from app.models import User

    async with async_session() as db:
        user = User(clerk_id=f"user_{uuid.uuid4().hex[:20]}", email="chat@example.com",
                    username=f"chat{uuid.uuid4().hex[:8]}", name="Chat Tester", timezone="America/New_York")
        db.add(user)
        await db.commit()
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    try:
        yield {"user": user, "client": client, "app": app}
    finally:
        app.dependency_overrides.clear()
        await client.aclose()
        async with async_session() as db:
            await db.execute(delete(User).where(User.id == user.id))
            await db.commit()
        await engine.dispose()


async def test_tool_token_authenticates_the_api_and_then_dies(env):
    with assistant.request_token(env["user"]) as token:
        r = await env["client"].get("/api/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
    r = await env["client"].get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_assistant_refuses_token_auth(env, monkeypatch):
    # A leaked token (or the assistant's own tool token) can't start a chat that spends money.
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    with assistant.request_token(env["user"]) as token:
        r = await env["client"].post("/api/me/assistant", json={"messages": [{"role": "user", "content": "hi"}]},
                                     headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_assistant_needs_a_user_message_last(env, monkeypatch):
    from app.auth import get_current_user_clerk_id

    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    env["app"].dependency_overrides[get_current_user_clerk_id] = lambda: env["user"].clerk_id
    r = await env["client"].post("/api/me/assistant", json={"messages": [{"role": "assistant", "content": "hi"}]},
                                 headers={"Authorization": "Bearer x"})
    assert r.status_code == 422
