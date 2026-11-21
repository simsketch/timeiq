"""Push tip decisions, the opt-in fields on /api/me, and the cron runner."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.main import app
from app.models.assistant_turn import AssistantTurn
from app.models.push_device import PushDevice
from app.models.user import User
from app.services import push, push_tips
from app.services.push_tips import TIPS, Facts, offer, plan
from tests.test_qa_db_races import env  # noqa: F401

CREATED = datetime(2026, 11, 2, 15, 0, tzinfo=timezone.utc)  # 10 AM in New York
NOTHING = Facts(has_calendar=False, has_assistant=False, has_booking=False, has_agent=False)
local_db = pytest.mark.skipif(not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url), reason="needs a local timeiq_qa database")


def at(day: int, hour: int = 10) -> datetime:
    """`hour` o'clock New York time, `day` days after signup (EST, UTC-5)."""
    return datetime(2026, 11, 2, 5, tzinfo=timezone.utc) + timedelta(days=day, hours=hour)


@pytest.fixture
def user():
    return User(id=uuid.uuid4(), email="maya@example.com", username="maya", timezone="America/New_York",
                created_at=CREATED, subscription_status="none", push_tips_step=0, push_tips_opt_in=True,
                push_tips_asked_at=CREATED, push_tips_sent_at=None)


def test_first_tip_is_the_calendar(user):
    assert plan(user, NOTHING, at(0, 11)) == (1, 1)


def test_tips_already_done_are_skipped(user):
    facts = Facts(has_calendar=True, has_assistant=True, has_booking=False, has_agent=False)
    assert plan(user, facts, at(1)) == (2, 2)
    user.push_tips_step = 2
    assert plan(user, facts, at(2)) == (4, 4)


def test_everything_done_marks_the_series_handled(user):
    user.push_tips_step = 2
    assert plan(user, Facts(True, True, True, True), at(3)) == (None, 5)
    user.push_tips_step = 5
    assert plan(user, NOTHING, at(4)) == (None, 5)


def test_share_tip_always_sends_once(user):
    user.push_tips_step = 1
    assert plan(user, Facts(True, True, True, True), at(1)) == (2, 2)


def test_quiet_hours_are_local(user):
    assert plan(user, NOTHING, at(1, 8)) == (None, 0)
    assert plan(user, NOTHING, at(1, 9))[0] == 1
    assert plan(user, NOTHING, at(1, 18))[0] == 1
    assert plan(user, NOTHING, at(1, 19)) == (None, 0)
    user.timezone = "Asia/Tokyo"
    assert plan(user, NOTHING, at(1, 10)) == (None, 0)  # midnight in Tokyo


def test_one_tip_per_local_day(user):
    user.push_tips_step, user.push_tips_sent_at = 1, at(1, 9)
    assert plan(user, NOTHING, at(1, 18)) == (None, 1)
    assert plan(user, NOTHING, at(2, 9)) == (2, 2)


def test_opt_out_sends_nothing(user):
    user.push_tips_opt_in = False
    assert plan(user, NOTHING, at(1)) == (None, 0)


@pytest.mark.parametrize("status", ["active", "past_due", "complimentary"])
def test_paid_accounts_get_nothing(user, status):
    user.subscription_status = status
    assert plan(user, NOTHING, at(1)) == (None, 0)
    assert not offer(user, at(1))


def test_trial_accounts_get_tips(user):
    user.subscription_status = "trialing"
    assert plan(user, NOTHING, at(1))[0] == 1


def test_nothing_after_ten_days(user):
    assert plan(user, NOTHING, at(9, 18))[0] == 1
    assert plan(user, NOTHING, at(10, 11)) == (None, 0)


def test_offer_once_within_window(user):
    user.push_tips_asked_at = None
    assert offer(user, at(1))
    assert not offer(user, at(11))
    user.push_tips_asked_at = at(1)
    assert not offer(user, at(2))


def test_copy_stays_off_purchase():
    for title, body, path in TIPS.values():
        text = f"{title} {body}".lower()
        assert not re.search(r"price|plan|upgrade|trial|subscri|\$| - | – | — ", text), text
        assert path.startswith("/") and "pricing" not in path


async def test_cron_requires_secret(monkeypatch):
    monkeypatch.setattr(settings, "CRON_SECRET", "cron-test")
    send = AsyncMock(return_value={"sent": 0})
    monkeypatch.setattr(push_tips, "send_push_tips", send)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/cron/push-tips", headers={"Authorization": "Bearer wrong"})).status_code == 401
        send.assert_not_awaited()
        assert (await client.get("/api/cron/push-tips", headers={"Authorization": "Bearer cron-test"})).status_code == 200


@local_db
async def test_opt_in_via_me_then_cron_sends_once_per_day(env, monkeypatch):
    free = env.users[1]  # subscription_status "none"
    now = datetime.now(timezone.utc)
    me = (await env.client.get("/api/me")).json()  # users[0] is paid
    assert me["push_tips_offer"] is False
    env.as_user(free)
    me = (await env.client.get("/api/me")).json()
    assert me["push_tips_offer"] is True and me["push_tips_opt_in"] is False
    me = (await env.client.patch("/api/me", json={"push_tips_opt_in": True})).json()
    assert me["push_tips_opt_in"] is True and me["push_tips_asked_at"] and me["push_tips_offer"] is False

    token = f"ExponentPushToken[{uuid.uuid4().hex}]"
    async with async_session() as db:
        db.add(PushDevice(token=token, user_id=free.id, platform="ios"))
        db.add(AssistantTurn(user_id=free.id))  # step 3 is done
        await db.commit()

    sent = []
    monkeypatch.setattr(push, "notify", AsyncMock(side_effect=lambda uid, title, body, data: sent.append((uid, title, data))))
    # Noon in the account's zone today, so quiet hours don't apply.
    zone = push_tips.host_zone(free)
    noon = now.astimezone(zone).replace(hour=12, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    if noon < now:
        noon += timedelta(days=1)
    run = push_tips.send_push_tips

    await run(noon)
    await run(noon + timedelta(hours=2))  # same local day: nothing more
    mine = [s for s in sent if s[0] == free.id]
    assert [s[1] for s in mine] == [TIPS[1][0]]
    assert mine[0][2] == {"path": "/calendars", "kind": "tip", "step": 1}

    await run(noon + timedelta(days=1))
    await run(noon + timedelta(days=2))  # skips step 3 (assistant used), sends 4
    mine = [s for s in sent if s[0] == free.id]
    assert [s[2]["step"] for s in mine] == [1, 2, 4]
    async with async_session() as db:
        row = (await db.execute(select(User).where(User.id == free.id))).scalar_one()
        assert row.push_tips_step == 4

    # Paying stops the series.
    async with async_session() as db:
        row = (await db.execute(select(User).where(User.id == free.id))).scalar_one()
        row.subscription_status = "active"
        await db.commit()
    await run(noon + timedelta(days=3))
    assert len([s for s in sent if s[0] == free.id]) == 3
