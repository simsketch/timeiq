"""Group meetings end to end against a real PostgreSQL database.

Only runs when DATABASE_URL points at a local throwaway timeiq_qa* database.
"Now" is frozen at Sun 2026-10-25 12:00 UTC; the meeting looks at Mon Nov 2
and Tue Nov 3 (EST, after the clocks change). Email is captured, not sent."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import pytest

from app.config import settings

if not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url):
    pytest.skip("needs a local timeiq_qa* database", allow_module_level=True)

import httpx  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.auth import get_current_user_clerk_id  # noqa: E402
from app.database import async_session, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CachedEvent, CalendarSource, User  # noqa: E402
from app.routers import group_meetings as gm_router  # noqa: E402
from app.services import email as email_service  # noqa: E402
from app.services import group_meetings as gm_service  # noqa: E402
from app.services.free_time import free_windows  # noqa: E402

NOW = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
MON_9 = "2026-11-02T14:00:00Z"
MON_10 = "2026-11-02T15:00:00Z"
MON_2PM = "2026-11-02T19:00:00Z"


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz is None else NOW.astimezone(tz)


def utc(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


async def busy(user: User, start: str, end: str) -> None:
    async with async_session() as db:
        src = CalendarSource(user_id=user.id, type="ics_url", name="Work", ics_url="https://x.test/a.ics", is_active=True)
        db.add(src)
        await db.flush()
        db.add(CachedEvent(calendar_source_id=src.id, user_id=user.id, title="Busy", starts_at=utc(start), ends_at=utc(end)))
        await db.commit()


@pytest.fixture
async def env(monkeypatch):
    for module in (gm_service, gm_router):
        monkeypatch.setattr(module, "datetime", FrozenDatetime)
    mail: list[dict] = []
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda p: mail.append(p))

    key = uuid.uuid4().hex[:8]
    async with async_session() as db:
        org = User(clerk_id=f"o_{key}", username=f"o_{key}", email=f"org_{key}@example.com", name="Olive",
                   timezone="America/New_York", subscription_status="active")
        friend = User(clerk_id=f"f_{key}", username=f"f_{key}", email=f"fran_{key}@example.com", name="Fran",
                      timezone="America/Los_Angeles", subscription_status="active")
        db.add_all([org, friend])
        await db.commit()
    who = {"clerk": org.clerk_id}
    app.dependency_overrides[get_current_user_clerk_id] = lambda: who["clerk"]
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "org": org, "friend": friend, "mail": mail, "who": who}
    app.dependency_overrides.clear()
    async with async_session() as db:
        await db.execute(delete(User).where(User.clerk_id.in_([f"o_{key}", f"f_{key}"])))
        await db.commit()
    await engine.dispose()


async def create(env, **kw):
    body = {
        "title": "Kickoff",
        "duration_minutes": 30,
        "window_start": "2026-11-02",
        "window_end": "2026-11-03",
        "participants": [
            {"email": "ann@example.com", "name": "Ann"},
            {"email": env["friend"].email},
            {"email": env["org"].email},  # the organizer is dropped
            {"email": "ANN@example.com"},  # duplicates are dropped
        ],
        **kw,
    }
    r = await env["client"].post("/api/group-meetings", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def token(link: str) -> str:
    return link.rsplit("/", 1)[1]


async def test_full_flow(env):
    c, mail = env["client"], env["mail"]
    await busy(env["org"], MON_10, "2026-11-02T16:00:00Z")  # organizer busy Mon 10-11 EST
    await busy(env["friend"], MON_9, "2026-11-02T14:30:00Z")  # Fran busy Mon 9-9:30 EST

    m = await create(env)
    assert len(m["participants"]) == 2
    assert [x["to"] for x in mail] == [["ann@example.com"], [env["friend"].email]]
    # Each invite leads with three one-tap times and a way to pick another.
    assert all(x["html"].count("?pick=") == 3 and "Pick a different time" in x["html"] for x in mail)
    starts = {s["start"] for s in m["slots"]}
    # Organizer never set hours, so 9 to 5 weekdays applies, minus their 10-11.
    assert MON_9 in starts and MON_10 not in starts and "2026-11-02T15:30:00Z" not in starts
    assert all(s["pending"] == 2 for s in m["slots"])

    ann = next(p for p in m["participants"] if p["email"] == "ann@example.com")
    fran = next(p for p in m["participants"] if p["email"] == env["friend"].email)

    # Opening the link shows the candidates, nothing answered yet.
    r = await c.get(f"/api/meet/{token(ann['link'])}")
    assert r.status_code == 200, r.text
    assert r.json()["organizer_name"] == "Olive" and not r.json()["responded"]
    assert {s["start"] for s in r.json()["slots"]} == starts
    assert len(r.json()["suggested"]) == 3 and set(r.json()["suggested"]) <= starts

    # Ann ticks two times by hand; a made-up time is ignored.
    r = await c.post(f"/api/meet/{token(ann['link'])}/respond",
                     json={"name": "Ann B", "available_starts": [MON_9, MON_2PM, "2030-01-01T00:00:00Z"]})
    assert r.status_code == 200, r.text
    pub = r.json()
    assert pub["responded"] and pub["answered"] == 2 and pub["people"] == 3
    picked = {s["start"]: s for s in pub["slots"]}
    assert picked[MON_9]["mine"] is True and picked[MON_9]["can_make_it"] == 2

    # The organizer can't answer for themselves.
    r = await c.post(f"/api/meet/{token(fran['link'])}/use-calendar")
    assert r.status_code == 400

    # Fran is on TimeIQ and shares her calendar instead of ticking.
    mail.clear()
    env["who"]["clerk"] = env["friend"].clerk_id
    r = await c.post(f"/api/meet/{token(fran['link'])}/use-calendar")
    assert r.status_code == 200, r.text
    assert r.json()["uses_calendar"] is True
    # Last answer in: the organizer hears once.
    assert [x["subject"] for x in mail] == ["Everyone answered: Kickoff"]
    assert "Everyone can make" in mail[0]["html"]

    env["who"]["clerk"] = env["org"].clerk_id
    d = (await c.get(f"/api/group-meetings/{m['id']}")).json()
    by = {s["start"]: s for s in d["slots"]}
    # Fran's 9 AM clash shows; 9 AM is "no" for her, 2 PM works for everyone.
    assert by[MON_9]["answers"][fran["id"]] is False
    assert by[MON_2PM]["yes"] == 2
    assert d["slots"][0]["yes"] == 2

    # A time that isn't free for the organizer can't be booked.
    r = await c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_10})
    assert r.status_code == 409

    mail.clear()
    r = await c.post(f"/api/group-meetings/{m['id']}/book", json={"starts_at": MON_2PM})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "booked"
    assert sorted(x["to"][0] for x in mail) == sorted(["ann@example.com", env["friend"].email, env["org"].email])
    ics = mail[0]["attachments"][0]["content"]
    assert "METHOD:REQUEST" in ics and ics.count("ATTENDEE") == 3

    # It now blocks both TimeIQ calendars.
    async with async_session() as db:
        rows = (await db.execute(select(CachedEvent.user_id).where(CachedEvent.group_meeting_id == uuid.UUID(m["id"])))).all()
        assert {r[0] for r in rows} == {env["org"].id, env["friend"].id}
        org = await db.get(User, env["org"].id)
        days = await free_windows(db, org, days=14, now=NOW, default_hours=True)
        monday = next(x for x in days if x["date"] == "2026-11-02")
        assert not any(utc(w["start"]) <= utc(MON_2PM) < utc(w["end"]) for w in monday["windows"])

    # Answering a booked meeting is refused.
    r = await c.post(f"/api/meet/{token(ann['link'])}/respond", json={"available_starts": []})
    assert r.status_code == 400

    # Booked meetings must be cancelled, not deleted.
    assert (await c.delete(f"/api/group-meetings/{m['id']}")).status_code == 409

    mail.clear()
    r = await c.post(f"/api/group-meetings/{m['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert len(mail) == 3 and "METHOD:CANCEL" in mail[0]["attachments"][0]["content"]
    async with async_session() as db:
        left = (await db.execute(select(CachedEvent).where(CachedEvent.group_meeting_id == uuid.UUID(m["id"])))).all()
        assert left == []
    assert (await c.delete(f"/api/group-meetings/{m['id']}")).status_code == 204


async def test_links_and_limits(env):
    c = env["client"]
    assert (await c.get("/api/meet/not-a-real-token")).status_code == 404
    r = await c.post("/api/group-meetings", json={
        "title": "x", "duration_minutes": 30, "participants": [{"email": env["org"].email}],
    })
    assert r.status_code == 422
    r = await c.post("/api/group-meetings", json={
        "title": "x", "duration_minutes": 30, "window_start": "2026-11-02", "window_end": "2026-12-30",
        "participants": [{"email": "a@example.com"}],
    })
    assert r.status_code == 422

    m = await create(env, send_invites=False)
    assert env["mail"] == []
    other = await c.get("/api/group-meetings")
    assert [x["id"] for x in other.json()] == [m["id"]]

    # Another account can't see or touch it.
    env["who"]["clerk"] = env["friend"].clerk_id
    assert (await c.get(f"/api/group-meetings/{m['id']}")).status_code == 404
    assert (await c.post(f"/api/group-meetings/{m['id']}/cancel")).status_code == 404
    env["who"]["clerk"] = env["org"].clerk_id

    r = await c.post(f"/api/group-meetings/{m['id']}/participants", json={"email": "ann@example.com"})
    assert r.status_code == 409
    r = await c.post(f"/api/group-meetings/{m['id']}/participants", json={"email": "bo@example.com"})
    assert r.status_code == 200 and len(r.json()["participants"]) == 3
    r = await c.post(f"/api/group-meetings/{m['id']}/remind")
    assert r.json() == {"reminded": 3}
    assert all(x["subject"].startswith("Reminder:") for x in env["mail"][-3:])
