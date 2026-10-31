"""Shared inbox and linked addresses on local Postgres; mail and Claude are mocked."""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import delete, func, select

from app.config import settings
from app.database import async_session
from app.models import CachedEvent, EmailAddressNotice, EmailImport, GroupMeeting, User, UserEmailAlias
from app.services import email_aliases, email_import, meeting_agent
from tests.test_qa_db_races import env, pytestmark  # noqa: F401

NOW = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
ONE_EVENT = email_import.Extraction(events=[email_import.ExtractedEvent(
    title="Practice", date="2026-11-03", start_time="17:00", end_time="18:00", all_day=False,
)])


@pytest.fixture
async def agent(env, monkeypatch):
    owner = env.users[0]
    async with async_session() as db:
        user = await db.get(User, owner.id)
        user.email = f"agent-{user.id}@example.com"
        owner.email = user.email
        private = email_import.address_for(user)
        for other in env.users[1:]:
            (await db.get(User, other.id)).subscription_status = "active"
        await db.commit()
    extract = AsyncMock(return_value=ONE_EVENT)
    monkeypatch.setattr(email_import, "extract_events", extract)
    monkeypatch.setattr(meeting_agent, "read_request", AsyncMock(return_value=meeting_agent.MeetingRequest(
        intent="find_time", title="Coffee", earliest_date="2026-11-02", latest_date="2026-11-06",
    )))
    monkeypatch.setattr(meeting_agent, "read_reply", AsyncMock(return_value=meeting_agent.ThreadReply()))
    inbox = {}

    async def fetch(email_id):
        return inbox[email_id], []

    monkeypatch.setattr(email_import, "fetch_email", fetch)
    notices = set()

    async def deliver(sender=None, *, received=None, to=None, refs=(), auth=None, now=NOW,
                      message_id=None, email_id=None, headers=None, payload_sender=None):
        sender = sender or owner.email
        notices.add(f"unknown:{sender.lower()}")
        email_id = email_id or uuid.uuid4().hex
        message_id = message_id or f"<{uuid.uuid4().hex}@mail.test>"
        inbox[email_id] = {
            "from": sender, "to": [email_import.agent_address()], "subject": "Schedule", "text": "See schedule",
            "authentication": auth if auth is not None else {"dkim": "pass"}, "message_id": message_id,
            "headers": {"from": sender, "to": ", ".join(to or [email_import.agent_address()]),
                        "references": " ".join(refs), **(headers or {})},
        }
        payload = {"data": {"email_id": email_id, "from": payload_sender or sender,
                            "received_for": received or [email_import.agent_address()]}}
        record = await email_import.process_inbound(payload, now=now)
        return record, message_id

    async def alias(email=None, verified=True):
        address = email or f"alias-{uuid.uuid4().hex}@example.com"
        async with async_session() as db:
            row = UserEmailAlias(user_id=owner.id, email=address, verification_sent_at=NOW,
                                 verified_at=NOW if verified else None)
            db.add(row)
            await db.commit()
        return address

    yield NS(**vars(env), private=private, owner=owner, deliver=deliver, alias=alias, extract=extract, inbox=inbox)
    async with async_session() as db:
        notices.update(f"verify:{recipient}" for mail in env.mail for recipient in mail.get("to", []))
        await db.execute(delete(EmailAddressNotice).where(EmailAddressNotice.key.in_(notices)))
        await db.execute(delete(EmailImport).where(EmailImport.resend_email_id.in_(inbox)))
        await db.commit()


async def test_account_and_verified_alias_route_by_fetched_sender(agent):
    record, _ = await agent.deliver(agent.owner.email.upper(), auth={"dmarc": "pass", "dkim": "fail"})
    assert record.user_id == agent.owner.id and record.status == "imported"
    record, _ = await agent.deliver(await agent.alias())
    assert record.user_id == agent.owner.id and record.status == "imported"
    assert agent.extract.await_count == 2


async def test_webhook_from_cannot_override_fetched_sender(agent):
    stranger = f"stranger-{uuid.uuid4().hex}@example.com"
    record, _ = await agent.deliver(stranger, payload_sender=agent.owner.email)
    assert record.status == "ignored" and record.user_id is None
    assert agent.extract.await_count == 0
    assert agent.mail[-1]["to"] == [stranger]


@pytest.mark.parametrize("kind", ["pending", "unauthenticated", "auto", "own_domain"])
async def test_unknown_or_untrusted_senders_do_not_import(agent, kind):
    sender = await agent.alias(verified=False) if kind == "pending" else agent.owner.email
    kwargs = {}
    if kind == "unauthenticated":
        kwargs["auth"] = {"dkim": "fail", "dmarc": "fail", "spf": "pass"}
    if kind == "auto":
        kwargs["headers"] = {"auto-submitted": "auto-replied"}
    if kind == "own_domain":
        sender = f"bookings@{settings.INBOUND_DOMAIN}"
    record, _ = await agent.deliver(sender, **kwargs)
    assert record is None or record.status == "ignored"
    assert agent.extract.await_count == 0
    # A verified but unlinked pending sender gets the linking instructions.
    assert len(agent.mail) == (1 if kind == "pending" else 0)


async def test_unknown_sender_notice_is_persistent_and_atomic(agent):
    sender = f"unknown-{uuid.uuid4().hex}@example.com"
    records = await asyncio.gather(*(agent.deliver(sender) for _ in range(4)))
    assert all(record.status == "ignored" and record.user_id is None for record, _ in records)
    assert len(agent.mail) == 1 and "Calendars" in agent.mail[0]["text"]
    assert "timeiq.app" in agent.mail[0]["text"]
    await agent.deliver(sender, now=NOW + timedelta(hours=23))
    assert len(agent.mail) == 1
    await agent.deliver(sender, now=NOW + timedelta(hours=24))
    assert len(agent.mail) == 2 and agent.extract.await_count == 0


async def _meeting(agent):
    record, message_id = await agent.deliver(to=["guest@example.com", email_import.agent_address()])
    assert record.status == "meeting"
    async with async_session() as db:
        meeting = await db.scalar(select(GroupMeeting).where(GroupMeeting.organizer_id == agent.owner.id))
    return meeting, message_id


async def test_guest_reply_to_agent_message_routes_to_organizer(agent):
    meeting, _ = await _meeting(agent)
    assert meeting.inbound_address == email_import.agent_address()
    outgoing = agent.mail[-1]
    assert outgoing["reply_to"] == email_import.agent_address()
    assert email_import.agent_address() in outgoing["from"]
    # In-Reply-To alone, to a message the agent sent, with no owner in To/Cc.
    record, _ = await agent.deliver("guest@example.com", auth={"dkim": "fail"},
                                    headers={"in-reply-to": outgoing["headers"]["Message-ID"]})
    assert record.user_id == agent.owner.id and record.status == "meeting_reply"
    assert agent.extract.await_count == 0


async def test_private_thread_uses_replacement_address(agent):
    record, ref = await agent.deliver(received=[agent.private], to=["guest@example.com", agent.private])
    assert record.status == "meeting"
    async with async_session() as db:
        owner = await db.get(User, agent.owner.id)
        owner.inbound_token = email_import.new_token()
        replacement = email_import.address_for(owner)
        await db.commit()
    await agent.deliver(received=[replacement], refs=[ref])
    async with async_session() as db:
        meeting = await db.scalar(select(GroupMeeting).where(GroupMeeting.organizer_id == agent.owner.id))
    from app.services import email as mail

    assert meeting.inbound_address is None
    assert replacement in mail._agent_from(meeting)
    assert email_import.agent_address() not in mail._agent_from(meeting)


@pytest.mark.parametrize("meeting", [False, True])
async def test_agent_and_private_copies_are_processed_once(agent, meeting):
    msg = f"<{uuid.uuid4().hex}@mail.test>"
    to = [email_import.agent_address(), agent.private, *(["guest@example.com"] if meeting else [])]
    first, _ = await agent.deliver(to=to, message_id=msg)
    second, _ = await agent.deliver(to=to, received=[agent.private], message_id=msg)
    assert first.status == ("meeting" if meeting else "imported") and second.status == "ignored"
    async with async_session() as db:
        count = await db.scalar(select(func.count()).select_from(GroupMeeting if meeting else CachedEvent).where(
            GroupMeeting.organizer_id == agent.owner.id if meeting else CachedEvent.user_id == agent.owner.id
        ))
    assert count == 1


async def test_multiple_owners_prefer_sender_then_existing_organizer(agent):
    other = agent.users[1]
    async with async_session() as db:
        user = await db.get(User, other.id)
        user.subscription_status = "active"
        other_private = email_import.address_for(user)
        await db.commit()
    to = [email_import.agent_address(), agent.private, other_private, other.email]
    # The other owner's private copy arrives before the shared copy.
    wrong, _ = await agent.deliver(to=to, received=[other_private])
    assert wrong.status == "ignored"
    first, ref = await agent.deliver(to=to)
    assert first.user_id == agent.owner.id and first.status == "meeting"
    reply, _ = await agent.deliver(other.email, to=to, refs=[ref])
    assert reply.user_id == agent.owner.id and reply.status == "meeting_reply"


async def test_shared_fetch_and_extraction_retries_keep_claims(agent, monkeypatch):
    original = email_import.fetch_email
    fetch = AsyncMock(side_effect=httpx.ConnectError("temporary"))
    monkeypatch.setattr(email_import, "fetch_email", fetch)
    email_id = uuid.uuid4().hex
    record, msg = await agent.deliver(email_id=email_id)
    assert record.status == "failed" and record.retryable and record.user_id is None
    monkeypatch.setattr(email_import, "fetch_email", original)
    agent.extract.side_effect = httpx.ConnectError("temporary")
    record, _ = await agent.deliver(email_id=email_id, message_id=msg)
    assert record.status == "failed" and record.retryable and record.attempts == 2
    agent.extract.side_effect = None
    record, _ = await agent.deliver(email_id=email_id, message_id=msg)
    assert record.status == "imported" and record.attempts == 3


@pytest.mark.parametrize("sender_kind,authenticated,booked", [
    ("alias", True, True), ("alias", False, False), ("guest", True, False),
])
async def test_book_it_requires_verified_owner_address(agent, monkeypatch, sender_kind, authenticated, booked):
    meeting, ref = await _meeting(agent)
    monkeypatch.setattr(meeting_agent, "read_reply", AsyncMock(return_value=meeting_agent.ThreadReply(book=True, book_option=1)))
    sender = await agent.alias() if sender_kind == "alias" else "guest@example.com"
    record, _ = await agent.deliver(sender, refs=[ref], auth={"dmarc": "pass" if authenticated else "fail"})
    assert record.status == ("meeting_booked" if booked else "meeting_reply")
    async with async_session() as db:
        current = await db.get(GroupMeeting, meeting.id)
    assert (current.status == "booked") == booked


def _confirmation_token(payload):
    return re.search(r"/email-addresses/confirm\?token=([\w-]+)", payload["text"]).group(1)


async def test_alias_add_confirm_single_use_list_delete_and_ownership(agent):
    email = f"work-{uuid.uuid4().hex}@example.com"
    response = await agent.client.post("/api/email-aliases", json={"email": email.upper()})
    assert response.status_code == 201, response.text
    alias = response.json()
    assert alias["email"] == email and alias["verified_at"] is None
    token = _confirmation_token(agent.mail[-1])
    async with async_session() as db:
        row = await db.get(UserEmailAlias, uuid.UUID(alias["id"]))
        assert row.verify_token_hash == email_aliases.token_hash(token) and token not in row.verify_token_hash
    assert (await agent.client.post(f"/api/email-aliases/{alias['id']}/resend")).status_code == 429
    # Confirm is public, independent of the signed-in account.
    agent.as_user(agent.users[1])
    assert (await agent.client.delete(f"/api/email-aliases/{alias['id']}")).status_code == 404
    assert (await agent.client.post(f"/api/email-aliases/{alias['id']}/resend")).status_code == 404
    confirmed = await agent.client.post("/api/email-aliases/confirm", json={"token": token})
    assert confirmed.status_code == 200 and confirmed.json()["verified_at"]
    assert (await agent.client.post("/api/email-aliases/confirm", json={"token": token})).status_code == 400
    assert (await agent.client.post("/api/email-aliases", json={"email": email})).status_code == 409
    agent.as_user(agent.owner)
    assert len((await agent.client.get("/api/email-aliases")).json()) == 1
    assert (await agent.client.delete(f"/api/email-aliases/{alias['id']}")).status_code == 204
    async with async_session() as db:
        assert await email_aliases.sender_user(db, email) is None


async def test_alias_expiry_resend_and_account_conflict(agent):
    email = f"work-{uuid.uuid4().hex}@example.com"
    added = (await agent.client.post("/api/email-aliases", json={"email": email})).json()
    token = _confirmation_token(agent.mail[-1])
    async with async_session() as db:
        row = await db.get(UserEmailAlias, uuid.UUID(added["id"]))
        row.verification_sent_at = datetime.now(timezone.utc) - timedelta(days=8)
        notice = await db.get(EmailAddressNotice, f"verify:{email}")
        notice.sent_at -= timedelta(minutes=2)
        await db.commit()
    expired = await agent.client.post("/api/email-aliases/confirm", json={"token": token})
    assert expired.status_code == 400 and "expired" in expired.text
    assert (await agent.client.post(f"/api/email-aliases/{added['id']}/resend")).status_code == 200
    fresh = _confirmation_token(agent.mail[-1])
    assert fresh != token
    assert (await agent.client.post("/api/email-aliases/confirm", json={"token": token})).status_code == 400
    # An account email can change between adding an alias and confirmation.
    async with async_session() as db:
        other = await db.get(User, agent.users[1].id)
        other.email = email
        await db.commit()
    assert (await agent.client.post("/api/email-aliases/confirm", json={"token": fresh})).status_code == 409


async def test_alias_limits_duplicates_and_validation(agent):
    assert (await agent.client.post("/api/email-aliases", json={"email": "broken"})).status_code == 422
    assert (await agent.client.post("/api/email-aliases", json={"email": email_import.agent_address()})).status_code == 400
    assert (await agent.client.post("/api/email-aliases", json={"email": agent.users[1].email.upper()})).status_code == 409
    pending = f"pending-{uuid.uuid4().hex}@example.com"
    assert (await agent.client.post("/api/email-aliases", json={"email": pending})).status_code == 201
    assert (await agent.client.post("/api/email-aliases", json={"email": pending})).status_code == 409
    key = uuid.uuid4().hex
    responses = await asyncio.gather(*(agent.client.post("/api/email-aliases", json={"email": f"limit-{key}-{i}@example.com"}) for i in range(12)))
    assert sum(r.status_code == 201 for r in responses) == 9
    assert len((await agent.client.get("/api/email-aliases")).json()) == 10


async def test_thread_match_never_imports_a_strangers_schedule(agent, monkeypatch):
    meeting, _ = await _meeting(agent)
    # The meeting agent declines it (as a forwarded schedule would be declined);
    # a non-owner on the thread must not get events onto the organizer's calendar.
    monkeypatch.setattr(meeting_agent, "handle", AsyncMock(return_value=None))
    outgoing = agent.mail[-1]
    record, _ = await agent.deliver("guest@example.com",
                                    headers={"in-reply-to": outgoing["headers"]["Message-ID"]})
    assert record.user_id == agent.owner.id and record.status == "ignored"
    assert agent.extract.await_count == 0
