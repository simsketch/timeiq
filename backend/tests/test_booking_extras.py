"""Booking extras with an in-memory session double and mocked email only."""
import asyncio
import uuid
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.routers import bookings as B, cron
from app.schemas.booking import BookingCreate
from app.schemas.event_type import EventTypeCreate, EventTypeUpdate
from app.services import availability as A, booking_reminders as R, email as E

NOW = datetime(2026, 11, 2, 8, tzinfo=timezone.utc)


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz is None else NOW.astimezone(tz)


def event_type(**kw):
    return NS(**{
        "id": uuid.uuid4(), "name": "Call", "slug": "call", "location": "https://meet.example.com/join",
        "duration_minutes": 30, "buffer_minutes": 0, "max_bookings_per_day": None,
        "min_notice_minutes": 0, "max_days_ahead": None, "reminder_minutes": [1440], "remind_host": False,
        "require_phone": False, "require_company": False, "require_url": False, **kw,
    })


def booking(**kw):
    start = NOW + timedelta(days=1)
    return NS(**{
        "id": uuid.uuid4(), "starts_at": start, "ends_at": start + timedelta(minutes=30),
        "created_at": NOW - timedelta(days=1), "status": "confirmed", "reminder_sent": [],
        "visitor_name": "Guest", "visitor_email": "guest@example.com", "timezone": "Asia/Tokyo",
        "cancel_token": "test-token", **kw,
    })


def host():
    return NS(id=uuid.uuid4(), name="Host", username="host", email="host@example.com", timezone="America/New_York")


def payload(start):
    return BookingCreate(visitor_name="Guest", visitor_email="guest@example.com", starts_at=start, timezone="Asia/Tokyo")


def result(value):
    return NS(scalar_one_or_none=lambda: value)


def test_event_type_defaults_and_multiple_reminders():
    defaults = EventTypeCreate(name="Call", duration=30)
    assert (defaults.min_notice_minutes, defaults.max_days_ahead, defaults.reminder_minutes, defaults.remind_host) == (0, None, [1440], False)
    assert EventTypeUpdate(reminder_minutes=[15, 60, 1440]).reminder_minutes == [15, 60, 1440]
    assert EventTypeUpdate(reminder_minutes=[]).reminder_minutes == []
    assert EventTypeUpdate(max_days_ahead=None).max_days_ahead is None


@pytest.mark.parametrize("fields", [
    {"min_notice_minutes": -1}, {"min_notice_minutes": 2881}, {"max_days_ahead": 0},
    {"max_days_ahead": 91}, {"reminder_minutes": [30]}, {"reminder_minutes": None},
    {"remind_host": None}, {"min_notice_minutes": None},
])
def test_invalid_extras_are_rejected(fields):
    with pytest.raises(ValidationError):
        EventTypeUpdate(**fields)


@pytest.mark.parametrize("offset,allowed", [(timedelta(minutes=60) - timedelta(microseconds=1), False), (timedelta(minutes=60), True), (timedelta(days=7), True), (timedelta(days=7, microseconds=1), False)])
def test_booking_window_edges(offset, allowed):
    assert (A.booking_window_error(event_type(min_notice_minutes=60, max_days_ahead=7), NOW + offset, NOW) is None) is allowed


def test_default_keeps_existing_horizon_and_rejects_past():
    et = event_type()
    assert A.booking_window_error(et, NOW + timedelta(seconds=1), NOW) is None
    assert A.booking_window_error(et, NOW + timedelta(days=90), NOW) is None
    assert A.booking_window_error(et, NOW + timedelta(days=90, seconds=1), NOW)
    assert A.booking_window_error(et, NOW, NOW)


@pytest.mark.parametrize("reschedule", [False, True])
@pytest.mark.parametrize("settings,offset,message", [
    ({"min_notice_minutes": 60}, timedelta(minutes=59), "notice"),
    ({"max_days_ahead": 7}, timedelta(days=8), "7 days"),
])
async def test_create_and_reschedule_enforce_window_before_sync_or_writes(monkeypatch, reschedule, settings, offset, message):
    monkeypatch.setattr(B, "datetime", FrozenDatetime)
    sync = AsyncMock()
    monkeypatch.setattr(B, "freshen_host_calendars", sync)
    et, h = event_type(**settings), host()
    old = booking(event_type_id=et.id, host_user_id=h.id)
    values = [old, et, h] if reschedule else [h, et]
    db = NS(execute=AsyncMock(side_effect=[result(v) for v in values]))
    with pytest.raises(HTTPException, match=message) as exc:
        if reschedule:
            await B.reschedule_booking(old.id, payload(NOW + offset), "test-token", db)
        else:
            await B.create_public_booking("host", "call", payload(NOW + offset), db)
    assert exc.value.status_code == 400
    assert old.status == "confirmed"
    sync.assert_not_awaited()


@pytest.mark.parametrize("reschedule", [False, True])
async def test_notice_is_rechecked_after_calendar_sync(monkeypatch, reschedule):
    clock = [NOW]

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0]

    async def sync(host):
        clock[0] += timedelta(minutes=2)

    monkeypatch.setattr(B, "datetime", Clock)
    monkeypatch.setattr(B, "freshen_host_calendars", sync)
    lock = AsyncMock()
    monkeypatch.setattr(B, "lock_host_bookings", lock)
    # Payment holds and the per-email limit are covered in test_paid_bookings.
    monkeypatch.setattr(B.payments, "require_payments", lambda host, event_type: None)
    monkeypatch.setattr(B.payments, "expire_holds", AsyncMock(return_value=0))
    monkeypatch.setattr(B.payments, "limit_booking_emails", AsyncMock())
    et, h = event_type(min_notice_minutes=60, price_cents=None), host()
    old = booking(event_type_id=et.id, host_user_id=h.id)
    values = [old, et, h] if reschedule else [h, et]
    db = NS(execute=AsyncMock(side_effect=[result(v) for v in values]), scalar=AsyncMock())
    with pytest.raises(HTTPException, match="notice") as exc:
        if reschedule:
            await B.reschedule_booking(old.id, payload(NOW + timedelta(minutes=61)), "test-token", db)
        else:
            await B.create_public_booking("host", "call", payload(NOW + timedelta(minutes=61)), db)
    assert exc.value.status_code == 400
    assert old.status == "confirmed"
    lock.assert_awaited_once()
    db.scalar.assert_not_awaited()


@pytest.mark.parametrize("settings,day,expected_first", [
    ({"min_notice_minutes": 240}, NOW.date(), "2026-11-02T12:00:00+00:00"),
    ({"max_days_ahead": 7}, (NOW + timedelta(days=8)).date(), None),
])
async def test_slots_enforce_event_window(monkeypatch, settings, day, expected_first):
    monkeypatch.setattr(A, "datetime", FrozenDatetime)
    rule = NS(start_time=time(9), end_time=time(17))
    db = NS(execute=AsyncMock(side_effect=[result(rule), NS(scalars=lambda: NS(all=lambda: [])), NS(all=lambda: [])]))
    h = host()
    h.timezone = "UTC"
    slots = await A.get_available_slots(db, h, event_type(**settings), day)
    assert (slots[0] if slots else None) == expected_first


@pytest.mark.parametrize("elapsed,expected", [
    (timedelta(microseconds=-1), []),
    (timedelta(0), [(1440, "guest")]),
    (timedelta(minutes=15), [(1440, "guest")]),
    (timedelta(days=1, microseconds=-1), [(1440, "guest")]),
    (timedelta(days=1), []),
])
def test_reminder_window_edges(elapsed, expected):
    assert R.due_reminders(booking(), event_type(), NOW + elapsed) == expected


def test_reminders_skip_late_creation_cancelled_rescheduled_and_past():
    et = event_type(reminder_minutes=[15, 60, 1440])
    assert R.due_reminders(booking(created_at=NOW + timedelta(microseconds=1)), et, NOW) == []
    assert R.due_reminders(booking(status="cancelled"), et, NOW) == []
    assert R.due_reminders(booking(status="rescheduled"), et, NOW) == []
    assert R.due_reminders(booking(starts_at=NOW), et, NOW) == []
    # A booking made two hours before the meeting still gets its one-hour reminder.
    b = booking(starts_at=NOW + timedelta(hours=1), created_at=NOW - timedelta(hours=1))
    assert R.due_reminders(b, et, NOW) == [(60, "guest")]


def test_multiple_reminders_and_recipients_are_once_only():
    b, et = booking(), event_type(reminder_minutes=[15, 60, 1440], remind_host=True)
    assert R.due_reminders(b, et, NOW) == [(1440, "guest"), (1440, "host")]
    b.reminder_sent = ["1440:guest", "1440:host"]
    assert R.due_reminders(b, et, NOW) == []
    later = b.starts_at - timedelta(hours=1)
    assert R.due_reminders(b, et, later) == [(60, "guest"), (60, "host")]
    b.reminder_sent += ["60:guest", "60:host"]
    assert R.due_reminders(b, et, b.starts_at - timedelta(minutes=15)) == [(15, "guest"), (15, "host")]
    assert R.due_reminders(b, event_type(reminder_minutes=[]), NOW) == []


async def test_reminder_email_has_recipient_timezone_location_links_and_stable_key(monkeypatch):
    sent = []
    monkeypatch.setattr(E.resend.Emails, "send", lambda p, options: sent.append((p, options)))
    b, et, h = booking(), event_type(), host()
    await E.send_booking_reminder(b, et, h, 1440, "guest")
    await E.send_booking_reminder(b, et, h, 1440, "host")
    for (mail, options), recipient, zone, when in zip(sent, ["guest", "host"], ["JST", "EST"], ["05:00 PM", "03:00 AM"]):
        assert zone in mail["html"] and when in mail["html"]
        assert et.location in mail["html"]
        assert f"/bookings/{b.id}/cancel?token=test-token" in mail["html"]
        assert f"/bookings/{b.id}/reschedule?token=test-token" in mail["html"]
        assert options["idempotency_key"] == f"booking-reminder/{b.id}/1440/{recipient}"
    assert sent[0][0]["to"] == [b.visitor_email] and sent[1][0]["to"] == [h.email]


async def test_worker_locks_booking_and_preserves_success_when_other_recipient_fails(monkeypatch):
    monkeypatch.setattr(R, "datetime", FrozenDatetime)
    b, et, h = booking(), event_type(remind_host=True), host()
    queries = []
    class Session:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def execute(self, query):
            queries.append(query)
            return NS(first=lambda: (b, et, h) if len(queries) == 1 else None)
        commit = AsyncMock()
    session = Session()
    monkeypatch.setattr(R, "async_session", lambda: session)
    sender = AsyncMock(side_effect=[None, RuntimeError("provider down")])
    monkeypatch.setattr(R, "send_booking_reminder", sender)
    assert await R.send_due_booking_reminders() == {"sent": 1, "failed": 1}
    assert b.reminder_sent == ["1440:guest"]
    assert R.due_reminders(b, et, NOW) == [(1440, "host")]
    session.commit.assert_awaited_once()
    sql = str(queries[0].compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE OF bookings SKIP LOCKED" in sql
    assert "reminder_sent @>" in sql and "created_at <=" in sql


async def test_overlapping_cron_workers_and_repeated_runs_deliver_once(monkeypatch):
    monkeypatch.setattr(R, "datetime", FrozenDatetime)
    b, et, h = booking(), event_type(remind_host=True), host()
    row_lock = asyncio.Lock()

    class Session:
        locked = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            if self.locked:
                row_lock.release()

        async def execute(self, query):
            assert query._for_update_arg.skip_locked
            if row_lock.locked() or not R.due_reminders(b, et, NOW):
                return NS(first=lambda: None)
            await row_lock.acquire()
            self.locked = True
            await asyncio.sleep(0)
            return NS(first=lambda: (b, et, h))

        async def commit(self):
            assert self.locked

    async def send(*args):
        await asyncio.sleep(0)

    sender = AsyncMock(side_effect=send)
    monkeypatch.setattr(R, "async_session", Session)
    monkeypatch.setattr(R, "send_booking_reminder", sender)
    runs = await asyncio.gather(R.send_due_booking_reminders(), R.send_due_booking_reminders())
    assert sum(run["sent"] for run in runs) == 2
    assert sender.await_count == 2
    assert b.reminder_sent == ["1440:guest", "1440:host"]
    assert await R.send_due_booking_reminders() == {"sent": 0, "failed": 0}
    assert sender.await_count == 2


async def test_slow_delivery_defers_host_to_stay_within_cron_budget(monkeypatch):
    monkeypatch.setattr(R, "datetime", FrozenDatetime)
    elapsed = [0]
    monkeypatch.setattr(R, "time", NS(monotonic=lambda: elapsed[0]))
    b, et, h = booking(), event_type(remind_host=True), host()

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, query):
            return NS(first=lambda: (b, et, h))

        commit = AsyncMock()

    async def send(*args):
        elapsed[0] = 30

    sender = AsyncMock(side_effect=send)
    session = Session()
    monkeypatch.setattr(R, "async_session", lambda: session)
    monkeypatch.setattr(R, "send_booking_reminder", sender)
    assert await R.send_due_booking_reminders() == {"sent": 1, "failed": 0}
    sender.assert_awaited_once()
    session.commit.assert_awaited_once()
    assert R.due_reminders(b, et, NOW) == [(1440, "host")]


@pytest.mark.parametrize("secret,header,code", [("", "Bearer ", 401), ("secret", "", 401), ("secret", "Bearer wrong", 401), ("secret", "Bearer secret", 200)])
async def test_reminder_cron_auth(monkeypatch, secret, header, code):
    app = FastAPI()
    app.include_router(cron.router)
    monkeypatch.setattr(cron.settings, "CRON_SECRET", secret)
    sender = AsyncMock(return_value={"sent": 0, "failed": 0})
    monkeypatch.setattr(cron, "send_due_booking_reminders", sender)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/cron/booking-reminders", headers={"Authorization": header} if header else {})
    assert response.status_code == code
    assert sender.await_count == (1 if code == 200 else 0)


async def test_public_booking_email_quota():
    db = NS(scalar=AsyncMock(return_value=5))
    with pytest.raises(HTTPException) as exc:
        await B.limit_booking_emails(db, host(), payload(NOW + timedelta(days=1)))
    assert exc.value.status_code == 429
