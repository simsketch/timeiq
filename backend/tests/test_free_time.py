"""Open windows for sharing availability."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.database import async_session
from app.models.availability_rule import AvailabilityRule
from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.services.free_time import _snap_down, _snap_up, free_windows, subtract
from tests.test_qa_db_races import env, pytestmark as db_only  # noqa: F401

UTC = timezone.utc


def t(h, m=0):
    return datetime(2026, 11, 2, h, m, tzinfo=UTC)


def test_subtract_splits_and_trims():
    assert subtract((t(9), t(17)), [(t(10), t(11)), (t(16), t(18)), (t(7), t(8))]) == [
        (t(9), t(10)), (t(11), t(16))
    ]
    assert subtract((t(9), t(10)), [(t(8), t(11))]) == []


def test_snapping_moves_inward():
    assert _snap_up(t(10, 7)) == t(10, 15) and _snap_up(t(10, 15)) == t(10, 15)
    assert _snap_down(t(10, 52)) == t(10, 45)


@db_only
async def test_windows_follow_hours_events_and_timezone(env):
    user = env.users[0]
    async with async_session() as db:
        u = await db.get(User, user.id)
        u.timezone = "America/New_York"
        for dow in range(7):
            db.add(AvailabilityRule(user_id=u.id, day_of_week=dow, start_time=time(9), end_time=time(17), is_active=dow < 5))
        src = CalendarSource(user_id=u.id, name="Work", type="ics_url", ics_url="https://example.com/a.ics")
        db.add(src)
        await db.flush()
        # Mon Nov 2 2026, 11:00-12:10 New York (EST = UTC-5).
        db.add(CachedEvent(user_id=u.id, calendar_source_id=src.id, title="Standup",
                           starts_at=datetime(2026, 11, 2, 16, 0, tzinfo=UTC), ends_at=datetime(2026, 11, 2, 17, 10, tzinfo=UTC)))
        await db.commit()
        now = datetime(2026, 11, 2, 13, 0, tzinfo=UTC)  # 8:00 AM in New York
        days = await free_windows(db, u, days=7, now=now)
    assert [d["date"] for d in days][:2] == ["2026-11-02", "2026-11-03"]
    monday = days[0]["windows"]
    assert monday == [
        {"start": "2026-11-02T14:00:00+00:00", "end": "2026-11-02T16:00:00+00:00"},
        {"start": "2026-11-02T17:15:00+00:00", "end": "2026-11-02T22:00:00+00:00"},
    ]
    saturday = next(d for d in days if d["date"] == "2026-11-07")
    assert saturday["working"] is False and saturday["windows"] == []
