"""Email a schedule in. Resend and Claude are mocked; the database is real."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.models.email_import import EmailImport
from app.models.user import User
from app.models.booking import Booking
from app.models.event_type import EventType
from app.services import email_import
from app.services.email_import import Attachment, ExtractedEvent, Extraction, rows_from_extraction, token_from_recipients
from tests.test_qa_db_races import env, pytestmark as db_only  # noqa: F401

NOW = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)
ICS = b"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:game-1
DTSTART;TZID=America/New_York:20261031T100000
DTEND;TZID=America/New_York:20261031T113000
SUMMARY:Soccer game vs Hawks
END:VEVENT
BEGIN:VEVENT
UID:practice
DTSTART;TZID=America/New_York:20261103T170000
DTEND;TZID=America/New_York:20261103T180000
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Practice
END:VEVENT
END:VCALENDAR
"""


def test_address_matching():
    tok = "0123456789abcdef0123"
    d = settings.INBOUND_DOMAIN
    assert token_from_recipients([f"Family <schedule-{tok}@{d}>"]) == tok
    assert token_from_recipients([f"SCHEDULE-{tok.upper()}@{d.upper()}"]) == tok
    assert token_from_recipients(["hello@" + d, f"schedule-{tok}@evil.com"]) is None


def test_extracted_events_become_rows():
    ny = ZoneInfo("America/New_York")
    ex = Extraction(events=[
        ExtractedEvent(title="Practice", date="2026-11-03", start_time="17:00", end_time="18:30", all_day=False),
        ExtractedEvent(title="Game", date="2026-11-07", start_time="9:00", end_time=None, all_day=False),
        ExtractedEvent(title="Picture day", date="2026-11-10", all_day=True),
        ExtractedEvent(title="LA tournament", date="2026-11-14", start_time="08:00", all_day=False, timezone="America/Los_Angeles"),
        ExtractedEvent(title="Bad date", date="sometime", all_day=True),
    ])
    rows = rows_from_extraction(ex, ny)
    assert [r["title"] for r in rows] == ["Practice", "Game", "Picture day", "LA tournament"]
    assert rows[0]["starts_at"] == datetime(2026, 11, 3, 22, 0, tzinfo=timezone.utc)  # 5 PM EST
    assert rows[0]["ends_at"] == datetime(2026, 11, 3, 23, 30, tzinfo=timezone.utc)
    assert rows[1]["ends_at"] - rows[1]["starts_at"] == datetime(2026, 1, 1, 1) - datetime(2026, 1, 1)
    assert rows[2]["is_all_day"] and rows[2]["starts_at"] == datetime(2026, 11, 10, 5, 0, tzinfo=timezone.utc)
    assert rows[3]["starts_at"] == datetime(2026, 11, 14, 16, 0, tzinfo=timezone.utc)  # 8 AM PST


async def _setup(env, monkeypatch, attachments, extraction=None, text="See attached schedule."):
    user = env.users[0]
    async with async_session() as db:
        u = await db.get(User, user.id)
        u.timezone = "America/New_York"
        token = email_import.ensure_inbound_token(u)
        await db.commit()
    for name, value in {"RESEND_INBOUND_API_KEY": "re_in", "RESEND_INBOUND_WEBHOOK_SECRET": "whsec_x", "ANTHROPIC_API_KEY": "sk-ant-x"}.items():
        monkeypatch.setattr(settings, name, value)

    async def fake_fetch(email_id):
        return {"subject": "Fall soccer", "text": text}, attachments
    monkeypatch.setattr(email_import, "fetch_email", fake_fetch)
    calls = []

    async def fake_extract(subject, body, atts, tz_name, today):
        calls.append((subject, [a.filename for a in atts], tz_name, today))
        return extraction or Extraction(events=[])
    monkeypatch.setattr(email_import, "extract_events", fake_extract)
    return user, token, calls


def _payload(token, email_id, sender="parent@example.com"):
    return {"type": "email.received", "data": {"email_id": email_id, "from": f"Parent <{sender}>",
                                               "to": [f"schedule-{token}@{settings.INBOUND_DOMAIN}"], "subject": "Fall soccer"}}


@db_only
@pytest.mark.parametrize("booking_status,authentication", [
    ("pending_payment", {"dmarc": "pass"}),
    ("confirmed", {"dmarc": "fail", "dkim": "fail"}),
])
async def test_booking_envelope_cannot_fall_through_to_schedule_import(env, monkeypatch, booking_status, authentication):
    user, _, calls = await _setup(env, monkeypatch, [Attachment(filename="season.ics", content_type="text/calendar", data=ICS)])
    async with async_session() as db:
        event = EventType(user_id=user.id, name="Call", slug="call", duration_minutes=30)
        db.add(event)
        await db.flush()
        booking = Booking(event_type_id=event.id, host_user_id=user.id, visitor_name="Guest",
                          visitor_email="guest@example.com", starts_at=NOW + timedelta(days=1),
                          ends_at=NOW + timedelta(days=1, minutes=30), timezone="UTC", status=booking_status)
        db.add(booking)
        await db.commit()
    from app.services import booking_agent
    action = AsyncMock()
    monkeypatch.setattr(booking_agent, "read_action", action)
    # A Bcc/envelope recipient need not appear in the message's To/Cc headers.
    async def fetch(email_id):
        return {"from": user.email, "to": [user.email], "headers": {"From": user.email},
                "authentication": authentication, "text": "See attached schedule."}, [
                    Attachment(filename="season.ics", content_type="text/calendar", data=ICS)]
    monkeypatch.setattr(email_import, "fetch_email", fetch)
    record = await email_import.process_inbound({"type": "email.received", "data": {
        "email_id": f"em_booking_{uuid.uuid4().hex}", "from": user.email,
        "received_for": [booking_agent.reply_address(booking)], "to": [user.email],
    }}, now=NOW)
    assert record.status == "ignored" and record.event_count == 0
    action.assert_not_awaited()
    assert calls == [] and env.mail == []
    async with async_session() as db:
        assert (await db.execute(select(CachedEvent).where(CachedEvent.user_id == user.id))).first() is None


@db_only
async def test_ics_schedule_is_imported_once_and_undone(env, monkeypatch):
    user, token, calls = await _setup(env, monkeypatch, [Attachment(filename="season.ics", content_type="text/calendar", data=ICS)])
    record = await email_import.process_inbound(_payload(token, "em_ics_1"), now=NOW)
    assert record.status == "imported" and record.event_count == 4
    assert calls == []  # .ics files are read without Claude, and the body isn't needed
    assert await email_import.process_inbound(_payload(token, "em_ics_1"), now=NOW) is None  # retried webhook

    sent = env.mail[-1]
    assert sorted(sent["to"]) == sorted({"parent@example.com", user.email.lower()})
    assert sent["subject"] == "Added 4 events from Fall soccer"
    assert f"/imports/undo?token={record.undo_token}" in sent["html"]

    async with async_session() as db:
        source = (await db.execute(select(CalendarSource).where(CalendarSource.user_id == user.id, CalendarSource.type == "email"))).scalar_one()
        events = (await db.execute(select(CachedEvent).where(CachedEvent.email_import_id == record.id))).scalars().all()
        assert source.name == "From email" and len(events) == 4
        assert {e.title for e in events} == {"Soccer game vs Hawks", "Practice"}

    r = await env.client.post("/api/email-imports/undo-by-token", json={"token": record.undo_token})
    assert r.status_code == 200 and r.json()["removed"] == 4
    async with async_session() as db:
        assert (await db.execute(select(CachedEvent).where(CachedEvent.email_import_id == record.id))).first() is None
    again = await env.client.post("/api/email-imports/undo-by-token", json={"token": record.undo_token})
    assert again.json() == {"removed": 0, "subject": "Fall soccer", "status": "undone"}


@db_only
async def test_pdf_goes_to_claude(env, monkeypatch):
    ex = Extraction(schedule_name="Fall band", events=[
        ExtractedEvent(title="Band concert", date="2026-11-20", start_time="19:00", end_time="20:30", all_day=False)
    ])
    _, token, calls = await _setup(env, monkeypatch, [Attachment(filename="band.pdf", content_type="application/pdf", data=b"%PDF-1.4")], ex)
    record = await email_import.process_inbound(_payload(token, "em_pdf_1"), now=NOW)
    assert record.status == "imported" and record.event_count == 1
    assert calls[0][1] == ["band.pdf"] and calls[0][2] == "America/New_York"
    assert env.mail[-1]["subject"] == "Added 1 event from Fall band"


@db_only
async def test_nothing_found_unknown_address_and_own_mail(env, monkeypatch):
    _, token, _ = await _setup(env, monkeypatch, [], text="Thanks for coming last night!")
    record = await email_import.process_inbound(_payload(token, "em_empty_1"), now=NOW)
    assert record.status == "empty" and "didn't find a schedule" in env.mail[-1]["subject"]
    assert await email_import.process_inbound(_payload("f" * 20, "em_x"), now=NOW) is None
    assert await email_import.process_inbound(_payload(token, "em_loop", sender="bookings@" + settings.INBOUND_DOMAIN), now=NOW) is None


@db_only
async def test_inbox_endpoint_and_new_address(env, monkeypatch):
    _, token, _ = await _setup(env, monkeypatch, [])
    body = (await env.client.get("/api/email-imports")).json()
    assert body["address"] == f"schedule-{token}@{settings.INBOUND_DOMAIN}" and body["enabled"] is True
    new = (await env.client.post("/api/email-imports/address")).json()["address"]
    assert new != body["address"]
    assert await email_import.process_inbound(_payload(token, "em_old_addr"), now=NOW) is None


@db_only
async def test_webhook_rejects_bad_signature(env, monkeypatch):
    monkeypatch.setattr(settings, "RESEND_INBOUND_WEBHOOK_SECRET", "whsec_" + "a" * 32)
    r = await env.client.post("/api/webhooks/inbound-email", json={"type": "email.received"},
                              headers={"svix-id": "x", "svix-timestamp": "1", "svix-signature": "v1,bad"})
    assert r.status_code == 400
