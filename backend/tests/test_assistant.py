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
    assert (row.prompt, row.reply) == ("hi", "Done.") and row.transcript[-1]["role"] == "assistant"
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


def _tool_call(name, args):
    from anthropic.types import Message

    return Message.model_validate({
        "id": "msg_2", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
        "content": [{"type": "text", "text": "I'll book Mon 2:00 PM with sam@example.com."},
                    {"type": "tool_use", "id": "tu_1", "name": name, "input": args}],
        "stop_reason": "tool_use", "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0},
    })


@pytest.fixture
async def held(chat, monkeypatch):
    """The model asks to book a meeting (an outward tool), then says it's done."""
    replies = [_tool_call("book_meeting", {"email": "sam@example.com", "starts_at": "2030-01-07T14:00:00-05:00"})]

    async def create(**kwargs):
        chat["calls"].append(kwargs)
        return replies.pop(0) if replies else _reply("Booked.")

    ran = []

    async def run_tool(_server, name, args):
        ran.append(name)
        return True, "{}"

    monkeypatch.setattr(llm, "client", lambda: SimpleNamespace(messages=SimpleNamespace(create=create)))
    monkeypatch.setattr(assistant, "_run_tool", run_tool)

    async def send(messages, decision=None, cards=True):
        return await chat["client"].post("/api/me/assistant", json={"messages": messages, "decision": decision, "confirm_cards": cards},
                                         headers={"Authorization": "Bearer x"})

    chat.update(ran=ran, send=send)
    return chat


async def test_outward_tools_wait_for_confirm(held):
    r = await held["send"]([{"role": "user", "content": "book sam tomorrow at 2"}])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pending"] == [{"tool": "book_meeting", "input": {"email": "sam@example.com", "starts_at": "2030-01-07T14:00:00-05:00"}}]
    assert body["reply"].startswith("Book sam@example.com on ") and held["ran"] == []

    r = await held["send"](body["messages"], "confirm")
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "Booked." and r.json()["pending"] is None
    assert held["ran"] == ["book_meeting"]
    rows = sorted(await _rows(held["user"]), key=lambda t: t.created_at)
    assert [t.prompt for t in rows] == ["book sam tomorrow at 2", "[Confirmed]"]
    # The admin log keeps which tool ran but never what it returned (users' calendar data).
    results = [b for m in rows[-1].transcript if isinstance(m["content"], list) for b in m["content"] if b["type"] == "tool_result"]
    assert results == [{"type": "tool_result", "tool_use_id": "tu_1"}]


async def test_cancel_skips_the_tool_and_the_model(held):
    body = (await held["send"]([{"role": "user", "content": "book sam"}])).json()
    calls = len(held["calls"])
    r = await held["send"](body["messages"], "cancel")
    assert r.status_code == 200 and r.json()["reply"] == "OK, I didn't do that."
    assert held["ran"] == [] and len(held["calls"]) == calls
    assert len(await _rows(held["user"])) == 1  # a cancel doesn't use up a turn


async def test_typing_past_the_card_cancels_the_held_tool(held):
    body = (await held["send"]([{"role": "user", "content": "book sam"}])).json()
    r = await held["send"]([*body["messages"], {"role": "user", "content": "actually make it 3pm"}])
    assert r.status_code == 200, r.text
    sent = held["calls"][-1]["messages"]
    i = next(i for i, m in enumerate(sent) if m["content"] == "actually make it 3pm")
    assert sent[i - 1]["content"][0]["type"] == "tool_result" and sent[i - 1]["content"][0]["is_error"]
    assert held["ran"] == []


async def test_confirm_needs_something_held(held):
    r = await held["send"]([{"role": "user", "content": "hi"}], "confirm")
    assert r.status_code == 422


async def test_older_apps_run_tools_after_a_text_yes(held):
    r = await held["send"]([{"role": "user", "content": "book sam"}], cards=False)
    assert r.status_code == 200 and r.json()["pending"] is None
    assert held["ran"] == ["book_meeting"]
    system = held["calls"][0]["system"][0]["text"]
    assert "Shall I go ahead?" in system and "Confirm and Cancel" not in system


async def test_the_card_says_what_confirm_will_do(held, monkeypatch):
    """Built from the held call, even when the model wrote nothing: moving Emad from 2 PM to 1 PM."""
    import uuid
    from datetime import datetime, timezone
    from app.database import async_session
    from app.models import Booking, EventType

    user = held["user"]
    async with async_session() as db:
        event = EventType(user_id=user.id, name="Call", slug="call-move", duration_minutes=30)
        db.add(event)
        await db.flush()
        booking = Booking(id=uuid.uuid4(), event_type_id=event.id, host_user_id=user.id, visitor_name="Emad",
                          visitor_email="emad@example.com", starts_at=datetime(2030, 1, 7, 19, tzinfo=timezone.utc),
                          ends_at=datetime(2030, 1, 7, 19, 30, tzinfo=timezone.utc), timezone="UTC", status="confirmed",
                          cancel_token=uuid.uuid4().hex)
        db.add(booking)
        await db.commit()
    silent = _tool_call("reschedule_booking", {"booking_id": str(booking.id), "starts_at": "2030-01-07T18:00:00+00:00"})
    silent.content = [b for b in silent.content if b.type == "tool_use"]
    replies = [silent]

    async def create(**kwargs):
        held["calls"].append(kwargs)
        return replies.pop(0)

    monkeypatch.setattr(llm, "client", lambda: SimpleNamespace(messages=SimpleNamespace(create=create)))
    body = (await held["send"]([{"role": "user", "content": "move emad to 1pm"}])).json()
    zone = user.timezone or "UTC"
    assert body["reply"].startswith("Move Emad's meeting from Mon Jan 7, ") and body["pending"], (zone, body["reply"])
    assert body["messages"][-1]["content"][0] == {"type": "text", "text": body["reply"]}
    assert held["ran"] == [] and len(held["calls"]) == 1
