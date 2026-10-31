"""Booking flows against a real PostgreSQL database: concurrency, DST, buffers,
the booking horizon, event type deletion and reschedule slots.

These only run when DATABASE_URL points at a local throwaway database named
timeiq_qa*, and are skipped otherwise, so they can never touch a shared or
production database. "Now" is frozen at 2026-10-25 12:00 UTC so the fixed
dates below stay in the future. Email and calendar sync are stubbed."""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings

if not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url):
    pytest.skip("needs a local timeiq_qa* database", allow_module_level=True)

import httpx  # noqa: E402
from icalendar import Calendar  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.auth import get_current_user_clerk_id  # noqa: E402
from app.database import async_session, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Booking, CachedEvent, CalendarSource, EventType, User  # noqa: E402
from app.routers import bookings as bookings_router  # noqa: E402
from app.routers import event_types as event_types_router  # noqa: E402
from app.services import availability as availability_service  # noqa: E402
from app.services import email as email_service  # noqa: E402

NOW = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
MONDAY_9AM = "2026-11-02T09:00:00-05:00"


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz is None else NOW.astimezone(tz)


@pytest.fixture
async def env(monkeypatch):
    for module in (availability_service, bookings_router, event_types_router):
        monkeypatch.setattr(module, "datetime", FrozenDatetime)

    async def no_sync(user_id, budget_seconds):
        return 0

    monkeypatch.setattr("app.tasks.freshen_user_calendars", no_sync)
    mail: list[dict] = []
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda p, **kw: mail.append(p))

    key = uuid.uuid4().hex[:10]
    async with async_session() as db:
        host = User(clerk_id=f"t_{key}", username=f"t_{key}", email="host@example.com",
                    name="Host", timezone="America/New_York", subscription_status="active")
        db.add(host)
        await db.commit()
    app.dependency_overrides[get_current_user_clerk_id] = lambda: host.clerk_id
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "host": host, "mail": mail}
    app.dependency_overrides.clear()
    async with async_session() as db:
        await db.execute(delete(User).where(User.clerk_id == f"t_{key}"))
        await db.commit()
    await engine.dispose()


async def make_event(env, **fields):
    r = await env["client"].post("/api/event-types", json={"name": "Call", "duration": 30, **fields})
    assert r.status_code == 201, r.text
    return r.json()


async def set_hours(env, start="09:00", end="17:00"):
    rules = [{"day_of_week": d, "start_time": start, "end_time": end} for d in range(7)]
    r = await env["client"].put("/api/availability-rules", json={"rules": rules})
    assert r.status_code == 200, r.text


def book_url(env, event, suffix="book"):
    return f"/api/public/{env['host'].username}/{event['slug']}/{suffix}"


def payload(start=MONDAY_9AM, **kw):
    return {"visitor_name": "Guest", "visitor_email": "guest@example.com", "starts_at": start,
            "timezone": "America/Chicago", **kw}


async def book(env, event, start=MONDAY_9AM):
    r = await env["client"].post(book_url(env, event), json=payload(start))
    assert r.status_code == 201, r.text
    async with async_session() as db:
        return await db.get(Booking, uuid.UUID(r.json()["id"]))


async def slots(env, event, day):
    r = await env["client"].get(book_url(env, event, f"slots?date={day}"))
    assert r.status_code == 200, r.text
    return [s["start"] for s in r.json()]


async def add_busy(env, start, end):
    async with async_session() as db:
        source = CalendarSource(user_id=env["host"].id, type="ics_url", name="busy",
                                ics_url="https://example.test/a.ics", last_synced_at=NOW)
        db.add(source)
        await db.flush()
        db.add(CachedEvent(user_id=env["host"].id, calendar_source_id=source.id, title="Busy",
                           starts_at=start, ends_at=end, is_all_day=False))
        await db.commit()


# QA-002
async def test_concurrent_bookings_of_one_slot_confirm_once(env):
    event = await make_event(env)
    await set_hours(env)
    rs = await asyncio.gather(*[
        env["client"].post(book_url(env, event), json=payload(visitor_email=f"g{i}@example.com"))
        for i in range(6)
    ])
    assert sorted(r.status_code for r in rs) == [201] + [409] * 5


async def test_concurrent_reschedules_use_the_booking_once(env):
    event = await make_event(env)
    await set_hours(env)
    b = await book(env, event)
    url = f"/api/public/bookings/{b.id}/reschedule?token={b.cancel_token}"
    rs = await asyncio.gather(*[
        env["client"].post(url, json=payload(f"2026-11-02T{10 + i}:00:00-05:00")) for i in range(4)
    ])
    assert [r.status_code for r in rs].count(201) == 1
    async with async_session() as db:
        confirmed = (await db.execute(select(Booking).where(
            Booking.host_user_id == env["host"].id, Booking.status == "confirmed"))).scalars().all()
    assert len(confirmed) == 1


# QA-014
async def test_fall_back_day_offers_both_one_oclock_hours(env):
    event = await make_event(env)
    await set_hours(env, "00:00", "04:00")
    offered = await slots(env, event, "2026-11-01")
    assert "2026-11-01T01:00:00-04:00" in offered and "2026-11-01T01:00:00-05:00" in offered
    assert len(offered) == 10  # five elapsed hours of 30-minute slots
    b = await book(env, event, "2026-11-01T01:30:00-04:00")
    assert b.ends_at - b.starts_at == timedelta(minutes=30)


async def test_fall_back_busy_event_uses_elapsed_end(env):
    event = await make_event(env)
    await set_hours(env, "00:00", "04:00")
    # 01:45-02:00 EST; the 01:30 EDT slot really ends at 01:00 EST.
    await add_busy(env, datetime(2026, 11, 1, 6, 45, tzinfo=timezone.utc), datetime(2026, 11, 1, 7, tzinfo=timezone.utc))
    offered = await slots(env, event, "2026-11-01")
    assert "2026-11-01T01:30:00-04:00" in offered
    assert "2026-11-01T01:30:00-05:00" not in offered


# QA-013
async def test_existing_bookings_keep_their_own_buffer(env):
    buffered = await make_event(env, buffer_time=30)
    plain = await make_event(env, name="Plain", buffer_time=0)
    await set_hours(env)
    await book(env, buffered)
    assert "2026-11-02T09:30:00-05:00" not in await slots(env, plain, "2026-11-02")
    r = await env["client"].post(book_url(env, plain), json=payload("2026-11-02T09:30:00-05:00"))
    assert r.status_code == 409
    assert "2026-11-02T10:00:00-05:00" in await slots(env, plain, "2026-11-02")


async def test_buffer_applies_around_calendar_events_and_across_rule_edges(env):
    event = await make_event(env, buffer_time=15)
    await set_hours(env)
    # 08:30-09:00 New York, before the rule starts
    await add_busy(env, datetime(2026, 11, 2, 13, 30, tzinfo=timezone.utc), datetime(2026, 11, 2, 14, tzinfo=timezone.utc))
    offered = await slots(env, event, "2026-11-02")
    assert "2026-11-02T09:00:00-05:00" not in offered
    assert "2026-11-02T09:30:00-05:00" in offered


# QA-012
async def test_no_slots_or_bookings_beyond_the_horizon(env):
    event = await make_event(env)
    await set_hours(env)
    assert availability_service.BOOKING_HORIZON_DAYS == 90
    assert await slots(env, event, "2027-01-20")  # day 87
    assert await slots(env, event, "2027-01-25") == []  # day 92
    r = await env["client"].post(book_url(env, event), json=payload("2027-01-25T09:00:00-05:00"))
    assert r.status_code == 400 and "90 days" in r.json()["detail"]


# QA-024
async def test_invalid_visitor_timezone_is_422(env):
    event = await make_event(env)
    await set_hours(env)
    r = await env["client"].post(book_url(env, event), json=payload(timezone="Mars/Olympus"))
    assert r.status_code == 422


# QA-025 / QA-026 / QA-031
async def test_event_type_intake_and_null_handling(env):
    event = await make_event(env, collect_company=True, require_phone=True)
    assert event["collect_phone"] and event["require_phone"] and event["collect_company"]
    r = await env["client"].patch(f"/api/event-types/{event['id']}", json={"collect_phone": False})
    assert r.json()["collect_phone"] is False and r.json()["require_phone"] is False
    for field in ("name", "duration", "is_active"):
        r = await env["client"].patch(f"/api/event-types/{event['id']}", json={field: None})
        assert r.status_code == 422, (field, r.text)


# QA-008
async def test_event_type_with_upcoming_bookings_cannot_be_deleted(env):
    event = await make_event(env)
    await set_hours(env)
    b = await book(env, event)
    r = await env["client"].delete(f"/api/event-types/{event['id']}")
    assert r.status_code == 409 and "upcoming bookings" in r.json()["detail"]
    ids = [x["id"] for x in (await env["client"].get("/api/bookings")).json()]
    assert str(b.id) in ids


async def test_event_type_with_past_bookings_is_archived(env):
    event = await make_event(env)
    async with async_session() as db:
        db.add(Booking(event_type_id=uuid.UUID(event["id"]), host_user_id=env["host"].id,
                       visitor_name="Past", visitor_email="p@example.com", timezone="UTC",
                       starts_at=NOW - timedelta(days=3), ends_at=NOW - timedelta(days=3, minutes=-30),
                       status="confirmed", cancel_token=uuid.uuid4().hex))
        await db.commit()
    deleted = await env["client"].delete(f"/api/event-types/{event['id']}")
    assert deleted.status_code == 204
    assert (await env["client"].get("/api/event-types")).json() == []
    assert len((await env["client"].get("/api/bookings")).json()) == 1
    assert (await env["client"].patch(f"/api/event-types/{event['id']}", json={"name": "x"})).status_code == 404
    again = await make_event(env)
    assert again["slug"] == event["slug"]  # archiving frees the slug


async def test_event_type_without_bookings_is_deleted(env):
    event = await make_event(env)
    deleted = await env["client"].delete(f"/api/event-types/{event['id']}")
    assert deleted.status_code == 204
    async with async_session() as db:
        assert await db.get(EventType, uuid.UUID(event["id"])) is None


async def test_deleting_a_host_still_removes_their_bookings(env):
    event = await make_event(env)
    await set_hours(env)
    await book(env, event)
    async with async_session() as db:
        await db.delete(await db.get(User, env["host"].id))
        await db.commit()
        left = (await db.execute(select(Booking).where(Booking.host_user_id == env["host"].id))).all()
    assert left == []


# QA-027
async def test_reschedule_slots_ignore_the_bookings_own_place(env):
    event = await make_event(env, max_bookings_per_day=1)
    await set_hours(env)
    b = await book(env, event)
    assert await slots(env, event, "2026-11-02") == []
    url = f"/api/public/bookings/{b.id}/slots?date=2026-11-02"
    r = await env["client"].get(f"{url}&token={b.cancel_token}")
    assert r.status_code == 200
    offered = [s["start"] for s in r.json()]
    assert MONDAY_9AM in offered and "2026-11-02T10:00:00-05:00" in offered
    assert (await env["client"].get(f"{url}&token=wrong")).status_code == 404
    assert (await env["client"].post(f"/api/public/bookings/{b.id}/cancel?token={b.cancel_token}")).status_code == 200
    assert (await env["client"].get(f"{url}&token={b.cancel_token}")).status_code == 400


# QA-009
async def test_reschedule_updates_and_cancel_removes_the_same_invite(env):
    event = await make_event(env)
    await set_hours(env)
    b = await book(env, event)

    def invite(mail):
        cal = Calendar.from_ical(mail["attachments"][0]["content"])
        ev = cal.walk("VEVENT")[0]
        return str(cal["method"]), str(ev["uid"]), int(ev["sequence"])

    assert invite(env["mail"][0]) == ("REQUEST", f"{b.id}@timeiq.app", 0)
    r = await env["client"].post(f"/api/public/bookings/{b.id}/reschedule?token={b.cancel_token}",
                                 json=payload("2026-11-02T11:00:00-05:00"))
    assert r.status_code == 201
    assert invite(env["mail"][2]) == ("REQUEST", f"{b.id}@timeiq.app", 1)
    async with async_session() as db:
        new = await db.get(Booking, uuid.UUID(r.json()["id"]))
    assert (await env["client"].post(f"/api/public/bookings/{new.id}/cancel?token={new.cancel_token}")).status_code == 200
    assert [invite(m) for m in env["mail"][4:]] == [("CANCEL", f"{b.id}@timeiq.app", 2)] * 2
