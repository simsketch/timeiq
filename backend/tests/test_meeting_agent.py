"""cc TimeIQ end to end against a real PostgreSQL database, with Claude and
Resend stubbed. Only runs against a local throwaway timeiq_qa* database.

"Now" is Sun 2026-10-25 12:00 UTC; requests look at Mon Nov 2 to Fri Nov 6."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import pytest

from app.config import settings

if not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url):
    pytest.skip("needs a local timeiq_qa* database", allow_module_level=True)

from sqlalchemy import delete, select  # noqa: E402

from app.database import async_session, engine  # noqa: E402
from app.models import CachedEvent, EmailImport, GroupMeeting, User  # noqa: E402
from app.services import email as email_service  # noqa: E402
from app.services import email_import  # noqa: E402
from app.services import meeting_agent  # noqa: E402

NOW = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
DOMAIN = settings.INBOUND_DOMAIN


@pytest.fixture
async def env(monkeypatch):
    mail: list[dict] = []
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda p: mail.append(p))
    inbox: dict[str, dict] = {}

    async def fake_fetch(email_id):
        return inbox[email_id], []

    monkeypatch.setattr(email_import, "fetch_email", fake_fetch)
    calls = {"request": [], "reply": []}
    answers = {
        "request": meeting_agent.MeetingRequest(
            intent="find_time", title="Pilot kickoff", duration_minutes=30,
            earliest_date="2026-11-02", latest_date="2026-11-06", time_of_day="morning", avoid_days=["Fri"],
        ),
        "reply": meeting_agent.ThreadReply(),
    }

    async def fake_request(subject, body, tz, today):
        calls["request"].append(body)
        return answers["request"]

    async def fake_reply(text, slots, tz):
        calls["reply"].append((text, slots))
        return answers["reply"]

    monkeypatch.setattr(meeting_agent, "read_request", fake_request)
    monkeypatch.setattr(meeting_agent, "read_reply", fake_reply)

    key = uuid.uuid4().hex[:8]
    token = uuid.uuid4().hex[:20]
    async with async_session() as db:
        owner = User(clerk_id=f"a_{key}", username=f"a_{key}", email=f"olive_{key}@example.com", name="Olive Park",
                     timezone="America/New_York", subscription_status="active", inbound_token=token)
        db.add(owner)
        await db.commit()
    address = f"schedule-{token}@{DOMAIN}"

    async def deliver(sender, to, cc=(), text="", subject="Pilot", refs=(), auth=None, headers=None):
        email_id = uuid.uuid4().hex
        msg_id = f"<{email_id}@mail.test>"
        h = dict(headers or {})
        if refs:
            h["references"] = " ".join(refs)
            h["in-reply-to"] = refs[-1]
        inbox[email_id] = {
            "from": sender, "to": list(to), "cc": list(cc), "subject": subject, "text": text,
            "message_id": msg_id, "headers": h, "authentication": auth or {"spf": "pass", "dkim": "pass", "dmarc": "pass"},
        }
        record = await email_import.process_inbound(
            {"type": "email.received", "data": {"email_id": email_id, "from": sender, "to": list(to), "cc": list(cc),
                                                 "subject": subject}},
            now=NOW,
        )
        return record, msg_id

    yield {"owner": owner, "address": address, "mail": mail, "deliver": deliver, "answers": answers, "calls": calls}
    async with async_session() as db:
        await db.execute(delete(User).where(User.clerk_id == f"a_{key}"))
        await db.commit()
    await engine.dispose()


async def meeting_for(owner) -> GroupMeeting | None:
    async with async_session() as db:
        return (await db.execute(select(GroupMeeting).where(GroupMeeting.organizer_id == owner.id))).scalars().first()


async def test_thread_to_booking(env):
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]
    dana = "Dana Reyes <dana@client.test>"

    # Dana emails Olive and cc's Olive's TimeIQ address.
    record, first_id = await deliver(dana, [owner.email], cc=[env["address"]], text="Can we find 30 min next week, mornings? Fridays are out.")
    assert record.status == "meeting"
    m = await meeting_for(owner)
    assert m.source == "email" and m.title == "Pilot kickoff" and m.duration_minutes == 30
    assert m.earliest_minute == 8 * 60 and m.latest_minute == 12 * 60 and 4 not in m.weekdays
    assert [p.email for p in m.participants] == ["dana@client.test"]
    assert m.participants[0].name == "Dana Reyes"

    # One reply to everyone, on the thread, from Olive's TimeIQ address.
    assert len(mail) == 1
    proposal = mail[0]
    assert proposal["from"] == f"Olive via TimeIQ <{env['address']}>"
    assert sorted(proposal["to"]) == sorted([owner.email, "dana@client.test"])
    assert proposal["subject"] == "Re: Pilot"
    assert proposal["headers"]["In-Reply-To"] == first_id
    assert first_id in proposal["headers"]["References"]
    assert "Mon Nov 2, 9 AM EST" in proposal["html"] and "Fri" not in proposal["html"].split("pick your times")[0].split("<ul")[1]
    assert f"/meet/{m.participants[0].token}" in proposal["html"]

    # Dana replies in words; Claude picks option 2 from the full list.
    mail.clear()
    env["answers"]["reply"] = meeting_agent.ThreadReply(chosen_options=[2])
    record, reply_id = await deliver(dana, [env["address"], owner.email], text="9:30 Monday works!\n\nOn Sun, Olive wrote:\n> old", refs=[first_id])
    assert record.status == "meeting_reply"
    text, slots = env["calls"]["reply"][-1]
    assert text == "9:30 Monday works!"  # quoted history stripped
    m = await meeting_for(owner)
    assert m.participants[0].available_starts == [slots[1].isoformat().replace("+00:00", "Z")]
    assert reply_id in m.thread_ids
    # A thank-you to Dana only, and (last answer) a note to Olive only, both on the thread.
    assert [x["to"] for x in mail] == [["dana@client.test"], [owner.email]]
    assert "Everyone has answered" in mail[1]["html"] and "book it" in mail[1]["html"]
    assert mail[1]["headers"]["In-Reply-To"] in m.thread_ids

    # A forged "book it" (fails DMARC and DKIM) books nothing.
    mail.clear()
    env["answers"]["reply"] = meeting_agent.ThreadReply(book=True)
    await deliver(owner.email, [env["address"]], text="book it", refs=[first_id, reply_id],
                  auth={"spf": "fail", "dkim": "fail", "dmarc": "fail"})
    assert (await meeting_for(owner)).status == "open"
    assert [x["to"] for x in mail] == [[owner.email]] and "verify that this came from you" in mail[0]["html"]

    # The real Olive replies "book it": the best time is booked for everyone.
    mail.clear()
    record, _ = await deliver(owner.email, [env["address"]], text="book it", refs=[first_id, reply_id])
    assert record.status == "meeting_booked"
    m = await meeting_for(owner)
    assert m.status == "booked" and m.starts_at == slots[1]
    assert len(mail) == 1 and sorted(mail[0]["to"]) == sorted([owner.email, "dana@client.test"])
    assert "METHOD:REQUEST" in mail[0]["attachments"][0]["content"]
    async with async_session() as db:
        blocked = (await db.execute(select(CachedEvent).where(CachedEvent.group_meeting_id == m.id))).scalars().all()
        assert [e.user_id for e in blocked] == [owner.id]

    # Later replies on a booked thread are logged, not acted on.
    mail.clear()
    record, _ = await deliver(dana, [env["address"]], text="Thanks!", refs=[first_id])
    assert record.status == "meeting_reply" and mail == []


async def test_new_person_joins_and_none_work(env):
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]
    _, first_id = await deliver(owner.email, ["dana@client.test"], cc=[env["address"]], text="Let's find a time.")
    mail.clear()
    env["answers"]["reply"] = meeting_agent.ThreadReply(none_work=True)
    record, _ = await deliver("Sam <sam@client.test>", [env["address"], owner.email], text="None of those work for me", refs=[first_id])
    assert record.status == "meeting_reply"
    m = await meeting_for(owner)
    sam = next(p for p in m.participants if p.email == "sam@client.test")
    assert sam.name == "Sam" and sam.responded_at is not None and sam.available_starts == []
    assert [x["to"] for x in mail] == [["sam@client.test"]] and "none of those times work" in mail[0]["html"]


async def test_ignored_and_fallbacks(env):
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]

    # The owner isn't on the thread: nothing happens.
    record, _ = await deliver("x@a.test", ["y@b.test"], cc=[env["address"]], text="meet?")
    assert record.status == "ignored" and mail == [] and await meeting_for(owner) is None

    # Out-of-office replies are ignored.
    record, _ = await deliver("x@a.test", [owner.email], cc=[env["address"]], subject="Out of Office", text="away",
                              headers={"auto-submitted": "auto-replied"})
    assert record.status == "ignored" and mail == []

    # A forwarded schedule (just the owner and TimeIQ) never reaches Claude's meeting check.
    async def no_events(*a, **k):
        return email_import.Extraction(events=[])

    import app.services.email_import as ei
    ei_extract = ei.extract_events
    ei.extract_events = no_events
    try:
        before = len(env["calls"]["request"])
        record, _ = await deliver(owner.email, [env["address"]], text="Fw: soccer schedule")
        assert record.status == "empty" and len(env["calls"]["request"]) == before

        # Others on the thread, but Claude says it's a schedule: imported, no meeting.
        env["answers"]["request"] = meeting_agent.MeetingRequest(intent="schedule", title="Band")
        record, _ = await deliver("coach@club.test", [owner.email], cc=[env["address"]], text="Practice is Tue 5pm")
        assert record.status == "empty" and await meeting_for(owner) is None
    finally:
        ei.extract_events = ei_extract

    async with async_session() as db:
        statuses = (await db.execute(select(EmailImport.status).where(EmailImport.user_id == owner.id))).scalars().all()
    assert sorted(statuses) == ["empty", "empty", "ignored", "ignored"]
