"""cc TimeIQ end to end against a real PostgreSQL database, with Claude and
Resend stubbed. Only runs against a local throwaway timeiq_qa* database.

"Now" is Sun 2026-10-25 12:00 UTC; requests look at Mon Nov 2 to Fri Nov 6."""
from __future__ import annotations

import re
import uuid
from email.utils import parseaddr
from datetime import datetime, timedelta, timezone

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
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda p, **kw: mail.append(p))
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

    async def fake_reply(text, offered, others, tz):
        calls["reply"].append((text, offered, others))
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

    async def deliver(sender, to, cc=(), text="", subject="Pilot", refs=(), auth=None, headers=None, msg_id=None):
        email_id = uuid.uuid4().hex
        msg_id = msg_id or f"<{email_id}@mail.test>"
        # Shaped like Resend's received email: top-level to/cc name only the
        # TimeIQ address that got this copy; the real recipients are headers.
        h = {"from": sender, "to": ", ".join(to), **({"cc": ", ".join(cc)} if cc else {}), **(headers or {})}
        if refs:
            h["references"] = " ".join(refs)
            h["in-reply-to"] = refs[-1]
        inbox[email_id] = {
            "from": parseaddr(sender)[1], "to": [address], "cc": [address] if address in cc else [],
            "subject": subject, "text": text,
            "message_id": msg_id, "headers": h, "authentication": auth or {"spf": "pass", "dkim": "pass", "dmarc": "pass"},
        }
        record = await email_import.process_inbound(
            {"type": "email.received", "data": {"email_id": email_id, "from": parseaddr(sender)[1], "to": [address],
                                                 "received_for": [address], "subject": subject}},
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

    # One email each, on the thread, from Olive's TimeIQ address: Olive's copy
    # has no participant links; Dana's has her own.
    assert [x["to"] for x in mail] == [[owner.email], ["dana@client.test"]]
    copy, proposal = mail
    for x in mail:
        assert x["from"] == f"Olive via TimeIQ <{env['address']}>"
        assert x["subject"] == "Re: Pilot"
        assert x["headers"]["In-Reply-To"] == first_id
        assert first_id in x["headers"]["References"]
    assert m.participants[0].token not in copy["html"] and "/meet/" not in copy["html"]
    assert "Mon Nov 2, 9 AM EST" in copy["html"]
    # Three times (not a wall of slots), each a one-tap link for Dana, plus "pick a different time".
    offered = re.findall(r"\?pick=([^\"&]+)", proposal["html"])
    assert len(offered) == 3
    assert "Here are 3 times" in proposal["html"] and "Pick a different time" in proposal["html"]
    assert "Mon Nov 2, 9 AM EST" in proposal["html"] and "Fri Nov 6" not in proposal["html"]
    assert f"/meet/{m.participants[0].token}" in proposal["html"]

    assert m.offered_starts == [o.replace("%3A", ":") for o in offered]
    assert m.participants[0].offered_starts == m.offered_starts

    # Dana replies in words; Claude picks the second offered time.
    mail.clear()
    env["answers"]["reply"] = meeting_agent.ThreadReply(chosen_options=[2])
    record, reply_id = await deliver(dana, [env["address"], owner.email], text="9:30 Monday works!\n\nOn Sun, Olive wrote:\n> old", refs=[first_id])
    assert record.status == "meeting_reply"
    text, slots, others = env["calls"]["reply"][-1]
    assert text == "9:30 Monday works!"  # quoted history stripped
    # Claude sees the three offered times as the options, and the rest only as times to name.
    assert [s.isoformat().replace("+00:00", "Z") for s in slots] == m.offered_starts
    assert others and not set(others) & set(slots)
    m = await meeting_for(owner)
    assert m.participants[0].available_starts == [m.offered_starts[1]]
    assert reply_id in m.thread_ids
    # A thank-you to Dana only, and (last answer) a note to Olive only, both on the thread.
    assert [x["to"] for x in mail] == [["dana@client.test"], [owner.email]]
    assert "Everyone has answered" in mail[1]["html"] and "book it" in mail[1]["html"]
    assert mail[1]["headers"]["In-Reply-To"] in m.thread_ids

    # A second copy of that same reply (same Message-ID) is skipped.
    mail.clear()
    record, _ = await deliver(dana, [env["address"], owner.email], text="9:30 Monday works!", refs=[first_id], msg_id=reply_id)
    assert record.status == "ignored" and mail == []

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


async def test_copy_for_another_address_is_skipped(env):
    """One email to two Resend-hosted addresses arrives twice; only the copy
    received for the TimeIQ address is handled."""
    result = await email_import.process_inbound(
        {"type": "email.received", "data": {
            "email_id": uuid.uuid4().hex, "from": "dana@client.test",
            "to": [env["address"], env["owner"].email], "received_for": [env["owner"].email],
        }},
        now=NOW,
    )
    assert result is None and env["mail"] == []


async def busy(user, start: datetime, end: datetime) -> None:
    from app.models import CalendarSource
    async with async_session() as db:
        # Freshly synced, so booking and holding don't try to fetch the feed.
        src = CalendarSource(user_id=user.id, type="ics_url", name="Work", ics_url="https://x.test/a.ics", is_active=True,
                             last_synced_at=datetime.now(timezone.utc))
        db.add(src)
        await db.flush()
        db.add(CachedEvent(calendar_source_id=src.id, user_id=user.id, title="Busy", starts_at=start, ends_at=end))
        await db.commit()


async def test_offered_times_accepts_a_free_one(env):
    """An interview scheduler (or another assistant) offers three times: TimeIQ
    skips the one the owner is busy for, accepts the next, and holds it."""
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]
    await busy(owner, datetime(2026, 11, 2, 15, tzinfo=timezone.utc), datetime(2026, 11, 2, 16, tzinfo=timezone.utc))
    env["answers"]["request"] = meeting_agent.MeetingRequest(
        intent="proposed_times", title="Interview with Acme", duration_minutes=45,
        proposed=[
            meeting_agent.ProposedTime(date="2026-11-02", start_time="10:00"),  # busy
            meeting_agent.ProposedTime(date="2026-11-03", start_time="14:00"),  # free
            meeting_agent.ProposedTime(date="2026-11-04", start_time="11:00", timezone="America/Los_Angeles"),
        ],
    )
    record, first_id = await deliver("Luna <luna@acme.test>", [owner.email], cc=[env["address"]],
                                     text="Here are three times for your interview...")
    assert record.status == "meeting_accepted"
    m = await meeting_for(owner)
    assert m.source == "accepted" and m.status == "booked"
    assert m.starts_at == datetime(2026, 11, 3, 19, tzinfo=timezone.utc) and m.duration_minutes == 45
    async with async_session() as db:
        holds = (await db.execute(select(CachedEvent).where(CachedEvent.group_meeting_id == m.id))).scalars().all()
    assert [h.title for h in holds] == ["Hold: Interview with Acme"]
    assert len(mail) == 1 and sorted(mail[0]["to"]) == sorted([owner.email, "luna@acme.test"])
    assert "Tue Nov 3, 2 PM EST" in mail[0]["html"] and "send the calendar invite" in mail[0]["html"]
    assert mail[0]["headers"]["In-Reply-To"] == first_id and "attachments" not in mail[0]


async def test_offered_times_none_free_counters_with_three(env):
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]
    env["answers"]["request"] = meeting_agent.MeetingRequest(
        intent="proposed_times", title="Interview with Acme", duration_minutes=30,
        proposed=[meeting_agent.ProposedTime(date="2026-11-02", start_time="19:00"),
                  meeting_agent.ProposedTime(date="2026-11-03", start_time="07:00")],  # outside working hours
    )
    record, _ = await deliver("Luna <luna@acme.test>", [owner.email], cc=[env["address"]], text="Two options...")
    assert record.status == "meeting"
    m = await meeting_for(owner)
    assert m.status == "open" and [p.email for p in m.participants] == ["luna@acme.test"]
    assert [x["to"] for x in mail] == [[owner.email], ["luna@acme.test"]]
    assert "/meet/" not in mail[0]["html"]
    html = mail[1]["html"]
    assert "none of them work for Olive" in html
    assert len(re.findall(r"\?pick=", html)) == 3 and "Pick a different time" in html


async def test_offered_time_taken_while_holding_counters(env, monkeypatch):
    """hold() rechecks under the host's lock; if the time went in the meantime,
    TimeIQ counters with the owner's own times instead of failing."""
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]

    async def taken(db, meeting, now=None):
        raise meeting_agent.gm.GroupMeetingError("That time is no longer free on your calendar. Pick another.")

    monkeypatch.setattr(meeting_agent.gm, "hold", taken)
    env["answers"]["request"] = meeting_agent.MeetingRequest(
        intent="proposed_times", title="Interview with Acme", duration_minutes=30,
        proposed=[meeting_agent.ProposedTime(date="2026-11-03", start_time="10:00")],
    )
    record, _ = await deliver("Luna <luna@acme.test>", [owner.email], cc=[env["address"]], text="How about Tue 10?")
    assert record.status == "meeting"
    async with async_session() as db:
        meetings = (await db.execute(select(GroupMeeting).where(GroupMeeting.organizer_id == owner.id))).scalars().all()
    assert [(m.status, m.source) for m in meetings] == [("open", "email")]
    assert [x["to"] for x in mail] == [[owner.email], ["luna@acme.test"]]
    assert "none of them work for Olive" in mail[1]["html"]


async def test_reply_is_read_against_the_offered_times(env):
    """"Any of those" means the three times offered, not every open slot; a
    time named outright still counts; an offered time that filled up since
    the email went out is dropped."""
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]
    dana = "Dana <dana@client.test>"
    _, first_id = await deliver(dana, [owner.email], cc=[env["address"]], text="Find 30 min?")
    m = await meeting_for(owner)
    offered = m.offered_starts
    assert len(offered) == 3

    # "Any of those work": Claude is given the three offered times as the options.
    env["answers"]["reply"] = meeting_agent.ThreadReply(chosen_options=[1, 2, 3])
    record, _ = await deliver(dana, [env["address"]], text="Any of those work", refs=[first_id])
    assert record.status == "meeting_reply"
    _, given, others = env["calls"]["reply"][-1]
    assert [meeting_agent.gm.iso(s) for s in given] == offered and len(others) > 3
    m = await meeting_for(owner)
    assert sorted(m.participants[0].available_starts) == sorted(offered)

    # "Only the second one, or <a time not offered>": an ordinal plus a time named outright.
    named = others[-1]
    env["answers"]["reply"] = meeting_agent.ThreadReply(chosen_options=[2], other_options=[len(others)])
    await deliver(dana, [env["address"]], text="Only the second one, or Thursday 11:30", refs=[first_id])
    m = await meeting_for(owner)
    assert m.participants[0].available_starts == sorted([offered[1], meeting_agent.gm.iso(named)])

    # The first offered time fills up; picking it now records nothing and says so.
    start = datetime.fromisoformat(offered[0].replace("Z", "+00:00"))
    await busy(owner, start, start + timedelta(hours=1))
    mail.clear()
    env["answers"]["reply"] = meeting_agent.ThreadReply(chosen_options=[1])
    await deliver(dana, [env["address"]], text="The first one", refs=[first_id])
    m = await meeting_for(owner)
    assert m.participants[0].available_starts == sorted([offered[1], meeting_agent.gm.iso(named)])
    assert [x["to"] for x in mail] == [["dana@client.test"]] and "just taken" in mail[0]["html"]

    # The owner's "book the second one" books the second offered time.
    env["answers"]["reply"] = meeting_agent.ThreadReply(book=True, book_option=2)
    record, _ = await deliver(owner.email, [env["address"]], text="book the second one", refs=[first_id])
    assert record.status == "meeting_booked"
    assert meeting_agent.gm.iso((await meeting_for(owner)).starts_at) == offered[1]


async def test_each_guest_gets_only_their_own_link(env):
    owner, mail, deliver = env["owner"], env["mail"], env["deliver"]
    _, first_id = await deliver("Dana <dana@client.test>", [owner.email], cc=["Sam <sam@client.test>", env["address"]],
                                text="Can the three of us meet?")
    m = await meeting_for(owner)
    tokens = {p.email: p.token for p in m.participants}
    assert set(tokens) == {"dana@client.test", "sam@client.test"}
    assert sorted(tuple(x["to"]) for x in mail) == sorted([(owner.email,), ("dana@client.test",), ("sam@client.test",)])
    for x in mail:
        (to,) = x["to"]
        for email, token in tokens.items():
            assert (token in x["html"]) == (email == to)
        assert x["headers"]["In-Reply-To"] == first_id and first_id in x["headers"]["References"]
    dana = next(x for x in mail if x["to"] == ["dana@client.test"])
    assert len(re.findall(r"\?pick=", dana["html"])) == 3 and "Sam" in dana["html"]


async def _second_owner(name: str):
    key = uuid.uuid4().hex[:8]
    async with async_session() as db:
        user = User(clerk_id=f"b_{key}", username=f"b_{key}", email=f"{name}_{key}@example.com", name=name.title(),
                    timezone="America/New_York", subscription_status="active", inbound_token=uuid.uuid4().hex[:20])
        db.add(user)
        await db.commit()
    return user


async def _drop(user) -> None:
    async with async_session() as db:
        await db.execute(delete(User).where(User.id == user.id))
        await db.commit()


def _copy(msg_id: str, sender: str, to: str, cc: str, received_for: str) -> dict:
    return {"from": sender, "to": [received_for], "subject": "Meet", "text": "Can we find a time?", "message_id": msg_id,
            "headers": {"from": sender, "to": to, "cc": cc}, "authentication": {"dmarc": "pass"}}


async def _meetings(*users) -> list[GroupMeeting]:
    async with async_session() as db:
        return (await db.execute(
            select(GroupMeeting).where(GroupMeeting.organizer_id.in_([u.id for u in users]))
        )).scalars().all()


async def test_one_email_in_two_timeiq_inboxes_starts_one_meeting(env):
    import asyncio

    owner = env["owner"]
    other = await _second_owner("ben")
    other_address = f"schedule-{other.inbound_token}@{DOMAIN}"
    both = f"{env['address']}, {other_address}"
    try:
        # Neither owner sent it: whichever copy claims the Message-ID first wins, even concurrently.
        msg = f"<{uuid.uuid4().hex}@mail.test>"
        to = f"{owner.email}, {other.email}"
        statuses = await asyncio.gather(
            meeting_agent.handle(owner.id, _copy(msg, "dana@client.test", to, both, env["address"]), NOW),
            meeting_agent.handle(other.id, _copy(msg, "dana@client.test", to, both, other_address), NOW),
        )
        assert sorted(statuses) == ["ignored", "meeting"]
        assert len(await _meetings(owner, other)) == 1

        # Ben sent it: Ben's TimeIQ handles it, even when Olive's copy is processed first.
        msg = f"<{uuid.uuid4().hex}@mail.test>"
        first = await meeting_agent.handle(owner.id, _copy(msg, other.email, owner.email, both, env["address"]), NOW)
        second = await meeting_agent.handle(other.id, _copy(msg, other.email, owner.email, both, other_address), NOW)
        assert (first, second) == ("ignored", "meeting")
        assert len([x for x in await _meetings(other) if msg in x.thread_ids]) == 1
        assert not [x for x in await _meetings(owner) if msg in x.thread_ids]

        # A reply on Ben's thread that also reaches Olive's inbox stays with Ben's meeting.
        reply = f"<{uuid.uuid4().hex}@mail.test>"
        r = {**_copy(reply, owner.email, f"{other_address}, {other.email}", env["address"], env["address"]),
             "text": "Tuesday works"}
        r["headers"]["references"] = msg
        assert await meeting_agent.handle(owner.id, r, NOW) == "ignored"
        assert not [x for x in await _meetings(owner) if reply in x.thread_ids]
    finally:
        await _drop(other)
