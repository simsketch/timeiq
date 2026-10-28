"""Timezone selection, summary content, delivery claims and signed opt-out."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.user import User
from app.services import weekly_summary as summary

NOW = datetime(2026, 11, 2, 12, 30, tzinfo=timezone.utc)  # Monday, 7:30 EST


class Result:
    def __init__(self, value):
        self.value = value

    def scalars(self):
        return self

    def all(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value


@pytest.fixture
def user(monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(settings, "WEEKLY_SUMMARY_SECRET", "weekly-summary-test-secret")
    return User(id=uuid.uuid4(), email="host@example.com", name="Host", timezone="America/New_York",
                subscription_status="active", weekly_summary_enabled=True, weekly_summary_sent_at=None)


@pytest.mark.parametrize("zone,now,expected", [
    ("America/New_York", NOW, True),
    ("America/Los_Angeles", NOW, False),
    ("Asia/Tokyo", datetime(2026, 11, 1, 22, 15, tzinfo=timezone.utc), True),
    ("Asia/Kathmandu", datetime(2026, 11, 2, 2, 0, tzinfo=timezone.utc), True),
    ("Pacific/Kiritimati", datetime(2026, 11, 1, 17, 0, tzinfo=timezone.utc), True),
    ("America/New_York", NOW + timedelta(days=1), False),
    ("America/New_York", datetime(2026, 10, 26, 11, 0, tzinfo=timezone.utc), True),
])
def test_local_monday_at_seven_including_dst_and_fractional_zones(user, zone, now, expected):
    user.timezone = zone
    assert summary.should_send(user, now) is expected


def test_preference_entitlement_and_weekly_timestamp_prevent_duplicate(user):
    assert summary.should_send(user, NOW)
    user.weekly_summary_sent_at = NOW - timedelta(days=7)
    assert summary.should_send(user, NOW)
    user.weekly_summary_sent_at = NOW - timedelta(minutes=15)
    assert not summary.should_send(user, NOW)
    user.weekly_summary_sent_at = None
    user.weekly_summary_enabled = False
    assert not summary.should_send(user, NOW)
    user.weekly_summary_enabled = True
    user.subscription_status = "canceled"
    assert not summary.should_send(user, NOW)


def test_week_boundaries_follow_local_dst(user):
    start, end = summary.week_bounds(user, NOW - timedelta(days=7))
    assert start == datetime(2026, 10, 26, 4, tzinfo=timezone.utc)
    assert end == datetime(2026, 11, 2, 5, tzinfo=timezone.utc)
    assert end - start == timedelta(days=7, hours=1)


async def test_builder_groups_bookings_meetings_and_keeps_currencies_separate(user, monkeypatch):
    start, _ = summary.week_bounds(user, NOW)
    booking = NS(starts_at=start + timedelta(hours=14), visitor_name="Guest <script>")
    meeting = NS(starts_at=start + timedelta(days=1, hours=15), title="Group planning")
    db = NS(execute=AsyncMock(side_effect=[Result([(booking, "Consultation")]), Result([meeting]),
         Result([(Decimal("2.5"), Decimal("100"), "USD"), (Decimal("1"), Decimal("80"), "EUR")])]),
         scalar=AsyncMock(side_effect=[uuid.uuid4(), 3]))
    windows = [{"windows": [
        {"start": (start + timedelta(days=d, hours=15)).isoformat(),
         "end": (start + timedelta(days=d, hours=15 + length)).isoformat()}
        for d, length in [(0, 2), (1, 5), (2, 3), (3, 4)]
    ]}]
    free = AsyncMock(return_value=windows)
    monkeypatch.setattr(summary, "free_windows", free)
    content = await summary.build_content(db, user, NOW)
    assert len(content["days"]) == 2
    assert content["hours"] == Decimal("3.5")
    assert content["amounts"] == {"USD": Decimal("250"), "EUR": Decimal("80")}
    assert content["overdue"] == 3
    assert [(b - a).total_seconds() / 3600 for a, b in content["highlights"]] == [5, 4, 3]
    html = summary.render_content(user, content, "https://api.test/unsubscribe?token=signed")
    for text in ["Monday, November 2", "Tuesday, November 3", "Group planning", "3.5 hours", "USD 250.00", "EUR 80.00", "Overdue invoices: 3"]:
        assert text in html
    assert "Guest &lt;script&gt;" in html and "Guest <script>" not in html
    assert "Unsubscribe from Your week" in html
    # Every data query is scoped to the receiving user's account or participation.
    for call in db.execute.call_args_list:
        assert user.id in call.args[0].compile().params.values()
    free.assert_awaited_once_with(db, user, days=7, min_minutes=60, now=NOW)


def empty_content(user):
    return {"start": summary.week_bounds(user, NOW)[0], "days": {}, "highlights": [], "tracking": False,
            "hours": Decimal("0"), "amounts": {}, "overdue": 0}


def test_empty_summary_has_helpful_copy_and_no_tracking_section(user):
    html = summary.render_content(user, empty_content(user), "https://api.test/unsubscribe")
    assert "no bookings or group meetings" in html
    assert "no open blocks" in html
    assert "Unbilled time" not in html


def test_unsubscribe_token_is_scoped_expiring_and_tamper_resistant(user, monkeypatch):
    token = summary.unsubscribe_token(user, NOW)
    assert summary.valid_token(user, token, NOW)
    assert not summary.valid_token(user, token[:-1] + ("0" if token[-1] != "0" else "1"), NOW)
    assert not summary.valid_token(user, token, NOW + summary.TOKEN_LIFETIME)
    other = User(id=uuid.uuid4(), email=user.email)
    assert not summary.valid_token(other, token, NOW)
    user.email = "changed@example.com"
    assert not summary.valid_token(user, token, NOW)
    assert summary.token_user_id("bad-token", NOW) is None
    assert summary.token_user_id(f"{user.id.hex}.{int(NOW.timestamp()) + 60}.{'é' * 64}", NOW) is None
    monkeypatch.setattr(settings, "WEEKLY_SUMMARY_SECRET", "")
    monkeypatch.setattr(settings, "CRON_SECRET", "")
    with pytest.raises(ValueError, match="Configure"):
        summary.unsubscribe_token(user, NOW)


async def test_hourly_runs_send_once_and_include_one_click_headers(user, monkeypatch):
    db = NS(commit=AsyncMock())
    queries = []
    async def execute(query):
        queries.append(str(query.compile(dialect=postgresql.dialect())))
        return Result(user if "FOR UPDATE" in str(query) else [user])
    db.execute = execute
    @asynccontextmanager
    async def session():
        yield db
    monkeypatch.setattr(summary, "async_session", session)
    monkeypatch.setattr(summary, "build_content", AsyncMock(return_value=empty_content(user)))
    messages = []
    monkeypatch.setattr(summary.mail.resend.Emails, "send", lambda payload, options: messages.append((payload, options)))
    assert await summary.send_weekly_summaries(NOW) == {"sent": 1, "failed": 0}
    assert await summary.send_weekly_summaries(NOW + timedelta(minutes=5)) == {"sent": 0, "failed": 0}
    assert user.weekly_summary_sent_at == NOW
    assert len(messages) == 1
    payload, options = messages[0]
    assert payload["subject"] == "Your week"
    assert payload["headers"]["List-Unsubscribe"].startswith("<http")
    assert payload["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert options["idempotency_key"].startswith(f"weekly-summary-{user.id}-")
    assert any("SKIP LOCKED" in query for query in queries)


async def test_failed_send_is_not_marked_sent_and_can_retry(user, monkeypatch):
    db = NS(commit=AsyncMock())
    monkeypatch.setattr(summary, "build_content", AsyncMock(return_value=empty_content(user)))
    def fail(*args):
        raise RuntimeError("Provider unavailable")
    monkeypatch.setattr(summary.mail.resend.Emails, "send", fail)
    with pytest.raises(RuntimeError):
        await summary.send_for_user(db, user, NOW)
    assert user.weekly_summary_sent_at is None
    db.commit.assert_not_awaited()
    monkeypatch.setattr(summary.mail.resend.Emails, "send", lambda *args: {"id": "sent"})
    await summary.send_for_user(db, user, NOW)
    assert user.weekly_summary_sent_at == NOW


async def test_get_is_safe_post_unsubscribes_and_forged_token_does_not(user):
    token = summary.unsubscribe_token(user, datetime.now(timezone.utc))
    db = NS(get=AsyncMock(return_value=user), commit=AsyncMock())
    async def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            url = f"/api/weekly-summary/unsubscribe?token={token}"
            assert (await client.get(url)).status_code == 200
            assert user.weekly_summary_enabled
            assert (await client.post(url, content="List-Unsubscribe=One-Click")).status_code == 200
            assert not user.weekly_summary_enabled
            assert (await client.post(url, content="List-Unsubscribe=One-Click")).status_code == 200
            user.weekly_summary_enabled = True
            assert (await client.post(url, content="")).status_code == 400
            bad_url = url[:-1] + ("0" if token[-1] != "0" else "1")
            assert (await client.post(bad_url, content="List-Unsubscribe=One-Click")).status_code == 400
            assert user.weekly_summary_enabled
    finally:
        app.dependency_overrides.clear()


async def test_summary_cron_requires_secret(monkeypatch):
    monkeypatch.setattr(settings, "CRON_SECRET", "cron-test")
    send = AsyncMock(return_value={"sent": 0, "failed": 0})
    monkeypatch.setattr(summary, "send_weekly_summaries", send)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/cron/weekly-summary", headers={"Authorization": "Bearer wrong"})).status_code == 401
        send.assert_not_awaited()
        assert (await client.get("/api/cron/weekly-summary", headers={"Authorization": "Bearer cron-test"})).status_code == 200


async def test_settings_can_disable_and_reenable_weekly_summary(user):
    from app.routers.users import UserUpdate, update_me

    db = NS(flush=AsyncMock(), refresh=AsyncMock())
    await update_me(UserUpdate(weekly_summary_enabled=False), user, db)
    assert not user.weekly_summary_enabled
    await update_me(UserUpdate(weekly_summary_enabled=True), user, db)
    assert user.weekly_summary_enabled
