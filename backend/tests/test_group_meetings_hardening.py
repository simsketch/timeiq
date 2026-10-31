"""Group meeting regressions for QA2-001/002/006/007/013: concurrent bookings
and holds, stale calendars, switched-off hours, simultaneous last answers and
long windows. Real PostgreSQL (row and advisory locks), so only against a
local throwaway timeiq_qa* database. Calendar syncs are stubbed, so nothing
leaves the machine."""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest

from app.config import settings

if not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url):
    pytest.skip("needs a local timeiq_qa* database", allow_module_level=True)

from sqlalchemy import delete, func, select  # noqa: E402

from app import tasks  # noqa: E402
from app.database import async_session  # noqa: E402
from app.models import AvailabilityRule, CachedEvent, GroupMeeting  # noqa: E402
from app.services import group_meetings as gm  # noqa: E402
from tests.test_group_meetings import MON_9, NOW, busy, create, env, token, utc  # noqa: E402,F401


@pytest.fixture
def synced(monkeypatch):
    """Stub calendar freshening: records who was freshened and runs an
    optional hook in place of the network fetch."""
    calls: list = []
    hooks: dict = {}

    async def fake(user_id, budget_seconds):
        calls.append(user_id)
        if user_id in hooks:
            await hooks[user_id]()
        return 0

    monkeypatch.setattr(tasks, "freshen_user_calendars", fake)
    return {"calls": calls, "hooks": hooks}


async def group_events(meeting_id: str) -> int:
    async with async_session() as db:
        return await db.scalar(
            select(func.count()).select_from(CachedEvent).where(CachedEvent.group_meeting_id == uuid.UUID(meeting_id))
        )


async def test_double_submit_books_once_and_invites_once(env, synced):
    c, mail = env["client"], env["mail"]
    m = await create(env, send_invites=False)
    rs = await asyncio.gather(*[c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_9}) for _ in range(2)])
    assert sorted(r.status_code for r in rs) == [200, 409]
    # One event on the organizer's calendar, and one round of invites.
    assert await group_events(m["id"]) == 1
    assert len(mail) == 3
    # Booking it again later is refused the same way, without new invites.
    r = await c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": "2026-11-02T19:00:00Z"})
    assert r.status_code == 409 and len(mail) == 3


async def test_two_meetings_cannot_take_the_same_host_time(env, synced):
    c = env["client"]
    ms = [await create(env, title=f"Meeting {i}", send_invites=False) for i in range(2)]
    rs = await asyncio.gather(*[c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_9}) for m in ms])
    assert sorted(r.status_code for r in rs) == [200, 409]
    assert sorted([await group_events(m["id"]) for m in ms]) == [0, 1]


async def test_hold_refuses_a_time_booked_meanwhile(env, synced):
    c, org = env["client"], env["org"]
    m = await create(env, send_invites=False)
    assert (await c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_9})).status_code == 200
    start = utc(MON_9) + timedelta(minutes=15)
    async with async_session() as db:
        accepted = GroupMeeting(organizer_id=org.id, title="Interview", duration_minutes=30, source="accepted",
                                status="booked", starts_at=start, ends_at=start + timedelta(minutes=30),
                                window_start=start.date(), window_end=start.date())
        db.add(accepted)
        await db.flush()
        with pytest.raises(gm.GroupMeetingError):
            await gm.hold(db, accepted, NOW)
        await db.rollback()
    assert org.id in synced["calls"]

    # A free time is held.
    later = utc("2026-11-03T19:00:00Z")
    async with async_session() as db:
        accepted = GroupMeeting(organizer_id=org.id, title="Interview", duration_minutes=30, source="accepted",
                                status="booked", starts_at=later, ends_at=later + timedelta(minutes=30),
                                window_start=later.date(), window_end=later.date())
        db.add(accepted)
        await db.flush()
        await gm.hold(db, accepted, NOW)
        await db.commit()
    assert await group_events(str(accepted.id)) == 1


async def test_book_freshens_calendars_before_deciding(env, synced):
    c, org, friend = env["client"], env["org"], env["friend"]
    m = await create(env, send_invites=False)
    fran = next(p for p in m["participants"] if p["email"] == friend.email)
    env["who"]["clerk"] = friend.clerk_id
    assert (await c.post(f"/api/meet/{token(fran['link'])}/use-calendar")).status_code == 200
    env["who"]["clerk"] = org.clerk_id

    async def new_event():
        # What a sync of a stale feed finds: the organizer is busy at 9.
        await busy(org, MON_9, "2026-11-02T15:00:00Z")

    synced["hooks"][org.id] = new_event
    r = await c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_9})
    assert r.status_code == 409
    # The organizer and the calendar-sharing participant were both freshened.
    assert set(synced["calls"]) >= {org.id, friend.id}


async def test_book_rechecks_calendar_sharing_participants(env, synced):
    c, org, friend = env["client"], env["org"], env["friend"]
    m = await create(env, send_invites=False)
    fran = next(p for p in m["participants"] if p["email"] == friend.email)
    env["who"]["clerk"] = friend.clerk_id
    assert (await c.post(f"/api/meet/{token(fran['link'])}/use-calendar")).status_code == 200
    env["who"]["clerk"] = org.clerk_id
    # Fran's calendar fills after she shared it (another meeting took the time).
    await busy(friend, MON_9, "2026-11-02T15:00:00Z")
    r = await c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_9})
    assert r.status_code == 409 and "no longer free for" in r.text
    assert await group_events(m["id"]) == 0


async def test_cancel_waits_for_a_booking_in_flight(env, synced):
    m = await create(env, send_invites=False)
    meeting_id = uuid.UUID(m["id"])
    async with async_session() as booking_db:
        await gm.book(booking_db, await booking_db.get(GroupMeeting, meeting_id), utc(MON_9), NOW)
        async with async_session() as cancel_db:
            cancelling = asyncio.create_task(gm.cancel(cancel_db, await cancel_db.get(GroupMeeting, meeting_id)))
            await asyncio.sleep(0.5)
            assert not cancelling.done()  # queued behind the booking's row lock
            await booking_db.commit()
            assert await cancelling is True  # it saw the booking
            await cancel_db.commit()
    assert await group_events(m["id"]) == 0


async def test_all_switched_off_hours_offer_nothing(env, synced):
    c, org = env["client"], env["org"]
    async with async_session() as db:
        db.add_all([AvailabilityRule(user_id=org.id, day_of_week=d, start_time=time(9), end_time=time(17), is_active=False)
                    for d in range(7)])
        await db.commit()
    m = await create(env, send_invites=False)
    assert m["slots"] == []
    async with async_session() as db:
        await db.execute(delete(AvailabilityRule).where(AvailabilityRule.user_id == org.id))
        await db.commit()
    # No saved hours at all still means 9 to 5 on weekdays.
    assert (await c.get(f"/api/group-meetings/{m['id']}")).json()["slots"]


async def test_simultaneous_last_answers_notify_once(env, synced):
    c, mail = env["client"], env["mail"]
    for _ in range(3):
        mail.clear()
        m = await create(env, send_invites=False)
        links = [token(p["link"]) for p in m["participants"]]
        rs = await asyncio.gather(*[c.post(f"/api/meet/{t}/respond", json={"available_starts": [MON_9]}) for t in links])
        assert all(r.status_code == 200 for r in rs), [r.text for r in rs]
        assert [x["subject"] for x in mail] == ["Everyone answered: Kickoff"]


async def test_long_window_offers_every_day(env, synced):
    m = await create(env, send_invites=False, window_start="2026-11-02", window_end="2026-11-20")
    starts = [s["start"] for s in m["slots"]]
    assert len(starts) <= gm.MAX_SLOTS
    weekdays = {(datetime(2026, 11, 2) + timedelta(days=i)).date().isoformat() for i in range(19)
                if (datetime(2026, 11, 2) + timedelta(days=i)).weekday() < 5}
    # Each weekday of the window has times (EST is UTC-5, so dates match).
    assert {s[:10] for s in starts} == weekdays


def test_thinning_spreads_and_stays_put():
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/New_York")
    first = datetime(2026, 11, 2, 14, tzinfo=timezone.utc)  # 9 AM EST
    slots = [first + timedelta(days=d, minutes=30 * i) for d in range(19) for i in range(16)]
    kept = gm._thin(slots, tz)
    assert len(kept) <= gm.MAX_SLOTS and {s.date() for s in kept} == {s.date() for s in slots}
    # Losing one open time doesn't reshuffle the others, so earlier answers still match.
    assert set(gm._thin([s for s in slots if s != kept[5]], tz)) == set(kept) - {kept[5]}
    assert gm._thin(slots[:10], tz) == slots[:10]
