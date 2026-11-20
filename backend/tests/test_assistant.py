"""The in-app assistant's one-off tool tokens and its endpoint's guards."""
from __future__ import annotations

import re
import time
import uuid
from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import assistant, llm


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


def _reply(text="Done.", **usage):
    from anthropic.types import Message

    return Message.model_validate({
        "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
        "content": [{"type": "text", "text": text}], "stop_reason": "end_turn", "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": 0, **usage},
    })


@pytest.fixture
async def chat(env, monkeypatch):
    """Signed in, a direct Anthropic key, and a fake model that records each request."""
    from app.auth import get_current_user_clerk_id

    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(settings, "AI_GATEWAY_API_KEY", "")
    monkeypatch.delenv("VERCEL_OIDC_TOKEN", raising=False)
    env["app"].dependency_overrides[get_current_user_clerk_id] = lambda: env["user"].clerk_id
    calls = []

    async def create(**kwargs):
        calls.append(kwargs)
        if env.get("fail"):
            raise RuntimeError("model down")
        return _reply(input_tokens=12, output_tokens=34, cache_read_input_tokens=1000, cache_creation_input_tokens=5)

    monkeypatch.setattr(llm, "client", lambda: SimpleNamespace(messages=SimpleNamespace(create=create)))

    async def post():
        return await env["client"].post("/api/me/assistant", json={"messages": [{"role": "user", "content": "hi"}]},
                                        headers={"Authorization": "Bearer x"})

    env.update(calls=calls, post=post)
    return env


async def _turns(user, count, ago):
    from datetime import datetime, timezone

    from app.database import async_session
    from app.models import AssistantTurn

    async with async_session() as db:
        db.add_all(AssistantTurn(user_id=user.id, created_at=datetime.now(timezone.utc) - ago) for _ in range(count))
        await db.commit()


async def _rows(user):
    from sqlalchemy import select

    from app.database import async_session
    from app.models import AssistantTurn

    async with async_session() as db:
        return (await db.execute(select(AssistantTurn).where(AssistantTurn.user_id == user.id))).scalars().all()


async def test_turn_records_token_usage_and_caches_the_prompt(chat):
    r = await chat["post"]()
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "Done." and "usage" not in r.json()
    [row] = await _rows(chat["user"])
    assert (row.input_tokens, row.output_tokens, row.model) == (1017, 34, "claude-sonnet-5-5")
    [call] = chat["calls"]
    assert call["model"] == "claude-sonnet-5-5" and call["extra_body"] is None
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert call["tools"][-1]["cache_control"] == {"type": "ephemeral"}


async def test_failed_turn_does_not_count(chat):
    chat["fail"] = True
    r = await chat["post"]()
    assert r.status_code == 502
    assert await _rows(chat["user"]) == []


async def test_minute_limit(chat):
    from datetime import timedelta

    await _turns(chat["user"], assistant.TURNS_PER_MINUTE, timedelta(seconds=20))
    r = await chat["post"]()
    assert r.status_code == 429 and "minute" in r.json()["detail"]
    assert chat["calls"] == []  # checked before the model is called


async def test_daily_limit_free_vs_paid(chat):
    from datetime import timedelta

    from sqlalchemy import update

    from app.database import async_session
    from app.models import User

    await _turns(chat["user"], assistant.TURNS_PER_DAY_FREE, timedelta(hours=2))
    await _turns(chat["user"], 5, timedelta(hours=25))  # outside the window
    r = await chat["post"]()
    assert r.status_code == 429 and r.json()["detail"].startswith("You've reached today's limit for Ask TimeIQ")
    assert chat["calls"] == []

    async with async_session() as db:
        await db.execute(update(User).where(User.id == chat["user"].id).values(subscription_status="active"))
        await db.commit()
    assert (await chat["post"]()).status_code == 200
    await _turns(chat["user"], assistant.TURNS_PER_DAY_PAID - assistant.TURNS_PER_DAY_FREE - 1, timedelta(hours=2))
    r = await chat["post"]()
    assert r.status_code == 429 and "today's limit" in r.json()["detail"]
