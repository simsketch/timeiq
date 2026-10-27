"""Inbound email and account hardening: entitlement, retries, byte limits,
overnight events, all-day feed dates, and Clerk-side account deletion.

Resend, Claude, Clerk and Stripe are mocked; the database is real.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import httpx
import pytest
import stripe
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.email_import import EmailImport
from app.models.user import User
from app.services import email_import, meeting_agent
from app.services.email_import import ExtractedEvent, Extraction, rows_from_extraction
from app.services.ics_generator import generate_feed_ics
from tests.test_qa_db_races import env, pytestmark as db_only  # noqa: F401
from tests.test_webhook_signatures import SECRET, signed

NOW = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)
NY = ZoneInfo("America/New_York")
ONE_EVENT = Extraction(events=[ExtractedEvent(title="Practice", date="2026-11-03", start_time="17:00", end_time="18:00", all_day=False)])


# ---------------------------------------------------------------------------
# Pure conversions (QA2-014, QA2-015)
# ---------------------------------------------------------------------------

def _row(start, end, day="2026-11-02", tz=NY):
    ex = Extraction(events=[ExtractedEvent(title="Shift", date=day, start_time=start, end_time=end, all_day=False)])
    return rows_from_extraction(ex, tz)[0]


def test_overnight_end_is_the_next_morning():
    row = _row("22:00", "02:00")
    assert row["starts_at"] == datetime(2026, 11, 3, 3, 0, tzinfo=timezone.utc)  # 10 PM EST
    assert row["ends_at"] == datetime(2026, 11, 3, 7, 0, tzinfo=timezone.utc)  # 2 AM EST next day


def test_overnight_across_dst_counts_real_hours():
    # Clocks fall back at 2 AM on Nov 1, 2026: 23:00 EDT to 03:00 EST is 5 real hours.
    row = _row("23:00", "03:00", day="2026-10-31")
    assert row["ends_at"] - row["starts_at"] == timedelta(hours=5)
    assert row["ends_at"] == datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc)


def test_missing_end_is_one_real_hour_even_across_dst():
    assert _row("09:00", None)["ends_at"] - _row("09:00", None)["starts_at"] == timedelta(hours=1)
    row = _row("01:30", None, day="2026-11-01")  # the repeated hour
    assert row["ends_at"] - row["starts_at"] == timedelta(hours=1)
    assert _row("09:00", "09:00")["ends_at"] - _row("09:00", "09:00")["starts_at"] == timedelta(hours=1)


def test_all_day_events_keep_the_owners_dates():
    tokyo = ZoneInfo("Asia/Tokyo")
    ex = Extraction(events=[ExtractedEvent(title="Holiday", date="2026-11-02", all_day=True, timezone="America/Los_Angeles")])
    row = rows_from_extraction(ex, tokyo)[0]
    assert row["starts_at"] == datetime(2026, 11, 1, 15, 0, tzinfo=timezone.utc)  # Tokyo midnight
    ev = SimpleNamespace(id=uuid.uuid4(), is_all_day=True, title="Holiday", starts_at=row["starts_at"], ends_at=row["ends_at"])
    ics = generate_feed_ics("Feed", [], [ev], obfuscate=False, tz=tokyo)
    assert "DTSTART;VALUE=DATE:20261102" in ics and "DTEND;VALUE=DATE:20261103" in ics
    # A synced all-day event for a New York host still lands on its own date.
    ny_ev = SimpleNamespace(id=uuid.uuid4(), is_all_day=True, title="Day off",
                            starts_at=datetime(2026, 11, 2, 5, tzinfo=timezone.utc), ends_at=datetime(2026, 11, 3, 5, tzinfo=timezone.utc))
    ics = generate_feed_ics("Feed", [], [ny_ev], obfuscate=False, tz=NY)
    assert "DTSTART;VALUE=DATE:20261102" in ics and "DTEND;VALUE=DATE:20261103" in ics


# ---------------------------------------------------------------------------
# Actual attachment bytes (QA2-011)
# ---------------------------------------------------------------------------

class _Chunks(httpx.AsyncByteStream):
    def __init__(self, n_chunks: int, size: int, counter: list):
        self.n_chunks, self.size, self.counter = n_chunks, size, counter

    async def __aiter__(self):
        for _ in range(self.n_chunks):
            self.counter.append(1)
            yield b"x" * self.size


async def test_size_limit_counts_streamed_bytes_across_attachments(monkeypatch):
    mb = 1024 * 1024
    served: list = []

    def respond(req):
        if req.url.path.endswith("/attachments"):
            # No sizes in the listing: the limit must come from the bytes themselves.
            return httpx.Response(200, json={"data": [
                {"filename": "a.pdf", "content_type": "application/pdf", "download_url": "https://files.test/a"},
                {"filename": "b.pdf", "content_type": "application/pdf", "download_url": "https://files.test/b"},
            ]})
        if req.url.host == "files.test":
            return httpx.Response(200, stream=_Chunks(8, mb, served))  # 8 MB each, no Content-Length
        return httpx.Response(200, json={"text": "Schedule"})

    real = httpx.AsyncClient
    monkeypatch.setattr(email_import.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(respond), **kw))
    with pytest.raises(email_import.ImportRejected):
        await email_import.fetch_email("em_big")
    # 8 MB of the first file, then reading stops as soon as the second passes 15 MB.
    assert len(served) == 16

    def small(req):
        if req.url.path.endswith("/attachments"):
            return httpx.Response(200, json={"data": [{"filename": "a.pdf", "content_type": "application/pdf", "download_url": "https://files.test/a"}]})
        if req.url.host == "files.test":
            return httpx.Response(200, content=b"%PDF-small")
        return httpx.Response(200, json={"text": "Schedule"})

    monkeypatch.setattr(email_import.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(small), **kw))
    _, attachments = await email_import.fetch_email("em_small")
    assert [a.data for a in attachments] == [b"%PDF-small"]


# ---------------------------------------------------------------------------
# Database-backed: entitlement and retries (QA2-009, QA2-010)
# ---------------------------------------------------------------------------

async def _setup(env, monkeypatch, user=None, status=None):
    user = user or env.users[0]
    async with async_session() as db:
        u = await db.get(User, user.id)
        u.timezone = "America/New_York"
        if status:
            u.subscription_status = status
        token = email_import.ensure_inbound_token(u)
        await db.commit()
    for name, value in {"RESEND_INBOUND_API_KEY": "re_in", "RESEND_INBOUND_WEBHOOK_SECRET": SECRET, "ANTHROPIC_API_KEY": "sk-ant-x"}.items():
        monkeypatch.setattr(settings, name, value)
    calls = SimpleNamespace(fetch=0, extract=0, agent=0, fail=[])

    async def fetch(email_id):
        calls.fetch += 1
        if calls.fail:
            raise calls.fail.pop(0)
        return {"subject": "Fall soccer", "text": "Practice Tuesday 5-6pm"}, []

    async def extract(*args):
        calls.extract += 1
        return ONE_EVENT

    real_handle = meeting_agent.handle

    async def handle(*args):
        calls.agent += 1
        return await real_handle(*args)

    monkeypatch.setattr(email_import, "fetch_email", fetch)
    monkeypatch.setattr(email_import, "extract_events", extract)
    monkeypatch.setattr(meeting_agent, "handle", handle)
    return token, calls


def _payload(token, email_id):
    return {"type": "email.received", "data": {"email_id": email_id, "from": "Parent <parent@example.com>",
                                               "to": [f"schedule-{token}@{settings.INBOUND_DOMAIN}"], "subject": "Fall soccer"}}


async def _post(env, payload):
    body = json.dumps(payload).encode()
    return await env.client.post("/api/webhooks/inbound-email", content=body, headers=signed(body))


@db_only
async def test_lapsed_account_skips_inbound_and_notifies_owner_once_a_day(env, monkeypatch):
    token, calls = await _setup(env, monkeypatch, status="canceled")
    first = await email_import.process_inbound(_payload(token, uuid.uuid4().hex), now=NOW)
    second = await email_import.process_inbound(_payload(token, uuid.uuid4().hex), now=NOW)
    assert (first.status, first.event_count, first.error) == ("skipped", 0, "subscription_inactive")
    assert second.status == "skipped"
    # Nothing was read, parsed or routed to the meeting agent.
    assert (calls.fetch, calls.extract, calls.agent) == (0, 0, 0)
    assert len(env.mail) == 1
    assert env.mail[0]["to"] == [env.users[0].email] and "isn't active" in env.mail[0]["subject"]
    # A day later the owner hears about it again.
    later = await email_import.process_inbound(_payload(token, uuid.uuid4().hex), now=NOW + timedelta(days=1, minutes=1))
    assert later.status == "skipped" and len(env.mail) == 2


@db_only
async def test_complimentary_and_billing_off_still_import(env, monkeypatch):
    token, calls = await _setup(env, monkeypatch, status="complimentary")
    assert (await email_import.process_inbound(_payload(token, uuid.uuid4().hex), now=NOW)).status == "imported"
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "")
    token, calls = await _setup(env, monkeypatch, user=env.users[1])  # subscription_status "none"
    assert (await email_import.process_inbound(_payload(token, uuid.uuid4().hex), now=NOW)).status == "imported"


@db_only
async def test_transient_fetch_failure_is_redelivered_then_idempotent(env, monkeypatch):
    token, calls = await _setup(env, monkeypatch)
    calls.fail = [httpx.ConnectError("Resend unreachable")]
    payload = _payload(token, uuid.uuid4().hex)
    r = await _post(env, payload)
    assert r.status_code == 503  # Resend redelivers
    assert env.mail == []  # no failure reply while a retry is pending
    r = await _post(env, payload)
    assert r.status_code == 200 and r.json()["status"] == "imported"
    r = await _post(env, payload)
    assert r.status_code == 200 and r.json()["status"] == "ignored"
    assert calls.fetch == 2 and len(env.mail) == 1
    async with async_session() as db:
        record = (await db.execute(select(EmailImport).where(EmailImport.resend_email_id == payload["data"]["email_id"]))).scalar_one()
        assert record.attempts == 2 and record.event_count == 1 and not record.retryable


@db_only
async def test_retries_are_bounded_and_permanent_errors_are_final(env, monkeypatch):
    token, calls = await _setup(env, monkeypatch)
    payload = _payload(token, uuid.uuid4().hex)
    calls.fail = [httpx.ReadTimeout("slow")] * email_import.MAX_ATTEMPTS
    for attempt in range(1, email_import.MAX_ATTEMPTS + 1):
        record = await email_import.process_inbound(payload, now=NOW)
        assert record.status == "failed" and record.attempts == attempt
        assert record.retryable is (attempt < email_import.MAX_ATTEMPTS)
    assert len(env.mail) == 1  # the failure reply, once retries are spent
    assert await email_import.process_inbound(payload, now=NOW) is None
    assert calls.fetch == email_import.MAX_ATTEMPTS

    request = httpx.Request("GET", "https://api.resend.com/emails/receiving/x")
    calls.fail = [httpx.HTTPStatusError("gone", request=request, response=httpx.Response(404, request=request))]
    payload = _payload(token, uuid.uuid4().hex)
    record = await email_import.process_inbound(payload, now=NOW)
    assert record.status == "failed" and not record.retryable
    assert await email_import.process_inbound(payload, now=NOW) is None


@db_only
async def test_stale_processing_claim_is_retaken_but_a_live_one_is_not(env, monkeypatch):
    token, calls = await _setup(env, monkeypatch)
    live, stale = uuid.uuid4().hex, uuid.uuid4().hex
    async with async_session() as db:
        for eid, age in ((live, timedelta(minutes=2)), (stale, timedelta(minutes=11))):
            db.add(EmailImport(user_id=env.users[0].id, resend_email_id=eid, status="processing", attempts=1,
                               claimed_at=NOW - age, created_at=NOW - age, undo_token=uuid.uuid4().hex))
        await db.commit()
    in_flight = await email_import.process_inbound(_payload(token, live), now=NOW)
    assert in_flight.status == "processing" and calls.fetch == 0
    # Through the webhook (real clock): keep redelivering until a live claim settles.
    just_now = uuid.uuid4().hex
    async with async_session() as db:
        db.add(EmailImport(user_id=env.users[0].id, resend_email_id=just_now, status="processing", attempts=1,
                           claimed_at=datetime.now(timezone.utc), undo_token=uuid.uuid4().hex))
        await db.commit()
    assert (await _post(env, _payload(token, just_now))).status_code == 503
    assert calls.fetch == 0
    retaken = await email_import.process_inbound(_payload(token, stale), now=NOW)
    assert retaken.status == "imported" and retaken.attempts == 2


# ---------------------------------------------------------------------------
# Clerk-side account deletion cancels billing (QA2-004)
# ---------------------------------------------------------------------------

@db_only
async def test_clerk_user_deleted_cancels_stripe_and_retries_on_failure(env, monkeypatch):
    monkeypatch.setattr(settings, "CLERK_WEBHOOK_SECRET", SECRET)
    user = env.users[0]
    async with async_session() as db:
        u = await db.get(User, user.id)
        u.stripe_subscription_id, u.subscription_plan = f"sub_{uuid.uuid4().hex[:8]}", "founder"
        await db.commit()
        sub_id = u.stripe_subscription_id
    cancelled, outage = [], [True]

    def cancel(sid):
        if outage:
            outage.pop()
            raise stripe.APIConnectionError("Stripe unreachable")
        cancelled.append(sid)

    monkeypatch.setattr(stripe.Subscription, "cancel", cancel)
    body = json.dumps({"type": "user.deleted", "data": {"id": user.clerk_id}}).encode()
    r = await env.client.post("/api/webhooks/clerk", content=body, headers=signed(body))
    assert r.status_code == 502  # Clerk redelivers
    async with async_session() as db:
        assert await db.get(User, user.id) is not None
    r = await env.client.post("/api/webhooks/clerk", content=body, headers=signed(body))
    assert r.status_code == 200 and cancelled == [sub_id]
    async with async_session() as db:
        assert await db.get(User, user.id) is None
