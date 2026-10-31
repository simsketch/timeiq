"""Booking email actions with Claude, mail and database operations mocked."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.routers import bookings as routes
from app.services import booking_agent as agent
from app.services import email as mail
from app.services import meeting_agent

NOW = datetime(2026, 10, 26, 11, tzinfo=timezone.utc)
FIND_BOOKING = agent.find_booking
REPLY_CONTEXT = agent.reply_context


class Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value


@pytest.fixture
def env(monkeypatch):
    owner = User(id=uuid.uuid4(), email="host@example.com", name="Host", username="host", timezone="America/New_York")
    event = EventType(id=uuid.uuid4(), user_id=owner.id, name="Consultation", slug="consultation", duration_minutes=30,
                      require_phone=False, require_company=False, require_url=False)
    booking = Booking(id=uuid.uuid4(), host_user_id=owner.id, event_type_id=event.id,
                      visitor_name="Guest", visitor_email="guest@example.com", starts_at=NOW + timedelta(days=2),
                      ends_at=NOW + timedelta(days=2, minutes=30), timezone=owner.timezone,
                      status="confirmed", cancel_token="secret-token", ical_sequence=0,
                      email_thread_ids=[], reschedule_offers={})
    db = NS(execute=AsyncMock(), scalar=AsyncMock(return_value=0), commit=AsyncMock(), flush=AsyncMock(),
            refresh=AsyncMock(), rollback=AsyncMock(), get=AsyncMock(return_value=event), add=lambda obj: None)
    detail = {"message_id": "<reply@example.com>", "subject": "Re: Consultation", "text": "Please cancel",
              "authentication": {"dmarc": "pass"}, "headers": {"From": booking.visitor_email}}
    action = AsyncMock(return_value=agent.BookingAction(intent="cancel", booking_id=str(booking.id)))
    monkeypatch.setattr(agent, "read_action", action)
    monkeypatch.setattr(agent, "reply_context", AsyncMock(return_value=None))
    monkeypatch.setattr(agent, "find_booking", AsyncMock(return_value=booking))
    monkeypatch.setattr(meeting_agent, "claim_message", AsyncMock(return_value=True))
    monkeypatch.setattr(meeting_agent, "owner_addresses", AsyncMock(return_value={owner.email}))
    messages = []
    monkeypatch.setattr(mail.resend.Emails, "send", lambda payload: messages.append(payload))
    monkeypatch.setattr(routes, "freshen_host_calendars", AsyncMock())
    monkeypatch.setattr(routes, "lock_host_bookings", AsyncMock())
    monkeypatch.setattr(routes, "is_bookable", AsyncMock(return_value=True))
    monkeypatch.setattr(routes.payments, "limit_booking_emails", AsyncMock())
    monkeypatch.setattr(routes.payments, "expire_holds", AsyncMock(return_value=0))
    return NS(owner=owner, event=event, booking=booking, db=db, detail=detail, action=action, mail=messages)


async def run(env, sender=None, refs=None):
    return await agent.handle(env.db, env.owner, env.detail, sender or env.booking.visitor_email, refs or [], NOW)


@pytest.mark.parametrize("sender,auth", [("intruder@example.com", {"dmarc": "pass"}),
                                        ("guest@example.com", {"spf": "pass"}),
                                        ("host@example.com", {"dkim": "fail"})])
async def test_only_verified_booking_parties_can_act(env, sender, auth):
    env.detail["authentication"] = auth
    assert await run(env, sender) == "ignored"
    env.action.assert_not_awaited()
    env.db.commit.assert_not_awaited()
    assert env.booking.status == "confirmed" and not env.mail


async def test_verified_alias_uses_host_cancel_path(env, monkeypatch):
    alias = "host-work@example.com"
    monkeypatch.setattr(meeting_agent, "owner_addresses", AsyncMock(return_value={env.owner.email, alias}))
    cancel = AsyncMock()
    monkeypatch.setattr(routes, "cancel_booking_as_host", cancel)
    assert await run(env, alias) == "meeting_cancelled"
    cancel.assert_awaited_once_with(env.booking.id, user=env.owner, db=env.db)


@pytest.mark.parametrize("sender,as_host", [("guest@example.com", False), ("host@example.com", True)])
async def test_cancel_uses_public_path_and_sends_calendar_cancellations(env, monkeypatch, sender, as_host):
    cancel_payment = AsyncMock()
    monkeypatch.setattr(routes.payments, "cancel_payment", cancel_payment)
    if as_host:
        env.db.execute.side_effect = [Result(env.booking), Result(env.event)]
    else:
        env.db.execute.side_effect = [Result(env.booking), Result(env.booking), Result(env.event), Result(env.owner)]
    assert await run(env, sender) == "meeting_cancelled"
    assert cancel_payment.await_args.kwargs == {"as_host": as_host}
    assert env.booking.status == "cancelled" and env.booking.ical_sequence == 1
    assert {m["to"][0] for m in env.mail} == {env.owner.email, env.booking.visitor_email}
    assert all("METHOD:CANCEL" in m["attachments"][0]["content"] for m in env.mail)
    assert env.db.commit.await_count == 2


async def test_rate_limit_prevents_more_agent_replies(env):
    env.db.scalar.return_value = agent.MAX_REPLIES_PER_DAY + 1
    assert await run(env) == "ignored"
    env.action.assert_not_awaited()
    assert not env.mail


async def test_reschedule_offers_then_guest_pick_uses_existing_path(env, monkeypatch):
    options = [datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=3, hours=h) for h in (2, 3, 4)]
    env.action.return_value = agent.BookingAction(intent="reschedule", earliest_date="2026-10-29", latest_date="2026-10-29")
    monkeypatch.setattr(agent, "open_times", AsyncMock(return_value=options))
    assert await run(env) == "meeting_reply"
    assert env.booking.status == "confirmed"
    proposal = env.mail[0]
    assert proposal["to"] == [env.owner.email, env.booking.visitor_email]
    assert "<ol>" in proposal["html"] and proposal["html"].count("<li>") == 3
    offer_id = proposal["headers"]["Message-ID"]
    assert proposal["reply_to"] == agent.reply_address(env.booking)

    env.action.return_value = agent.BookingAction(intent="pick")
    env.detail.update(text="The second one works", message_id="<pick@example.com>")
    parse_pick = AsyncMock(return_value=meeting_agent.ThreadReply(chosen_options=[2]))
    monkeypatch.setattr(meeting_agent, "read_reply", parse_pick)
    env.db.execute.side_effect = [Result(env.booking), Result(env.event), Result(env.owner), Result(env.booking)]
    created = []
    def add(obj):
        obj.id = uuid.uuid4()
        created.append(obj)
    env.db.add = add
    assert await run(env, refs=[offer_id]) == "meeting_rescheduled"
    parse_pick.assert_awaited_once()
    assert parse_pick.call_args.args[1] == options
    assert env.booking.status == "cancelled"
    replacement = created[0]
    assert replacement.starts_at == options[1]
    assert replacement.visitor_email == env.booking.visitor_email
    assert replacement.rescheduled_from_id == env.booking.id
    assert replacement.ical_sequence == 1
    assert agent.confirmation_id(env.booking, "guest") in replacement.email_thread_ids
    assert len(env.mail) == 3
    assert all("METHOD:REQUEST" in m["attachments"][0]["content"] for m in env.mail[1:])
    routes.is_bookable.assert_awaited_once()
    assert routes.is_bookable.call_args.kwargs["exclude_booking_id"] == env.booking.id


async def test_old_offer_pick_uses_that_offers_order(env, monkeypatch):
    older = [NOW + timedelta(days=3, hours=h) for h in (2, 3, 4)]
    newer = list(reversed(older))
    env.booking.reschedule_offers = {
        "<old@timeiq.app>": {"starts": [s.isoformat() for s in older], "created_at": NOW.isoformat()},
        "<new@timeiq.app>": {"starts": [s.isoformat() for s in newer], "created_at": NOW.isoformat()},
    }
    env.action.return_value = agent.BookingAction(intent="pick")
    pick = AsyncMock(return_value=meeting_agent.ThreadReply(chosen_options=[1, 2]))
    monkeypatch.setattr(meeting_agent, "read_reply", pick)
    assert await run(env, refs=["<old@timeiq.app>"]) == "meeting_reply"
    assert pick.call_args.args[1] == older
    assert env.booking.status == "confirmed"
    assert "Which one" in env.mail[0]["html"]


async def test_unavailable_pick_keeps_booking_and_asks_one_question(env, monkeypatch):
    options = [datetime.now(timezone.utc) + timedelta(days=3)]
    env.booking.reschedule_offers = {"<offer@test>": {"starts": [s.isoformat() for s in options], "created_at": NOW.isoformat()}}
    env.action.return_value = agent.BookingAction(intent="pick")
    monkeypatch.setattr(meeting_agent, "read_reply", AsyncMock(return_value=meeting_agent.ThreadReply(chosen_options=[1])))
    monkeypatch.setattr(routes, "is_bookable", AsyncMock(return_value=False))
    env.db.execute.side_effect = [Result(env.booking), Result(env.event), Result(env.owner), Result(env.booking)]
    assert await run(env, refs=["<offer@test>"]) == "meeting_reply"
    assert env.booking.status == "confirmed"
    assert env.mail[0]["html"].count("?") == 1
    env.db.rollback.assert_awaited_once()


async def test_duplicate_does_not_cancel_or_send(env, monkeypatch):
    monkeypatch.setattr(meeting_agent, "claim_message", AsyncMock(return_value=False))
    assert await run(env) == "ignored"
    assert env.booking.status == "confirmed" and not env.mail


async def test_unrelated_reply_is_ignored(env):
    env.action.return_value = agent.BookingAction(intent="other")
    assert await run(env) == "ignored"
    assert env.booking.status == "confirmed" and not env.mail


async def test_ambiguous_change_asks_one_question(env):
    env.action.return_value = agent.BookingAction(intent="other", needs_clarification=True)
    assert await run(env) == "meeting_reply"
    assert env.booking.status == "confirmed" and len(env.mail) == 1
    assert env.mail[0]["html"].count("?") == 1


async def test_auto_reply_ignored_before_any_db_or_model_call(monkeypatch):
    db = AsyncMock()
    monkeypatch.setattr(meeting_agent, "async_session", db)
    assert await meeting_agent.handle(uuid.uuid4(), {"headers": {"Auto-Submitted": "auto-replied"}}) == "ignored"
    db.assert_not_called()


async def test_cc_ambiguity_asks_one_question_and_does_not_change_booking(env, monkeypatch):
    monkeypatch.setattr(agent, "find_booking", AsyncMock(return_value=None))
    env.db.execute.return_value = Result([env.booking])
    env.owner.inbound_token = "abc123"
    env.action.return_value = agent.BookingAction(intent="cancel")
    result = await agent.handle(env.db, env.owner, env.detail, env.owner.email, [], NOW,
                               request=NS(intent="cancel"))
    assert result == "meeting_reply" and env.booking.status == "confirmed"
    assert len(env.mail) == 1 and env.mail[0]["html"].count("?") == 1


async def test_cc_guest_cancel_selects_only_their_booking(env, monkeypatch):
    monkeypatch.setattr(agent, "find_booking", AsyncMock(return_value=None))
    env.db.execute.side_effect = [Result([env.booking]), Result(env.booking), Result(env.booking), Result(env.booking), Result(env.event), Result(env.owner)]
    result = await agent.handle(env.db, env.owner, env.detail, env.booking.visitor_email, [], NOW,
                               request=NS(intent="cancel"))
    assert result == "meeting_cancelled" and env.booking.status == "cancelled"
    params = env.db.execute.call_args_list[0].args[0].compile().params
    assert env.booking.visitor_email in params.values() and env.owner.id in params.values()


async def test_cc_model_cannot_select_a_booking_outside_authorized_candidates(env, monkeypatch):
    monkeypatch.setattr(agent, "find_booking", AsyncMock(return_value=None))
    env.owner.inbound_token = "abc123"
    env.db.execute.return_value = Result([env.booking])
    env.action.return_value = agent.BookingAction(intent="cancel", booking_id=str(uuid.uuid4()))
    result = await agent.handle(env.db, env.owner, env.detail, env.booking.visitor_email, [], NOW,
                               request=NS(intent="cancel"))
    assert result == "meeting_reply" and env.booking.status == "confirmed"
    assert len(env.mail) == 1 and "Which booking" in env.mail[0]["html"]


async def test_clarification_retains_original_request_and_can_route_reply_without_owner_on_thread(env, monkeypatch):
    monkeypatch.setattr(agent, "find_booking", AsyncMock(return_value=None))
    env.owner.inbound_token = "abc123"
    env.db.execute.return_value = Result([env.booking])
    env.action.return_value = agent.BookingAction(intent="reschedule")
    env.detail["text"] = "Please move my appointment to Thursday morning"
    saved = []
    env.db.add = saved.append
    assert await agent.handle(env.db, env.owner, env.detail, env.booking.visitor_email, [], NOW,
                              request=NS(intent="reschedule")) == "meeting_reply"
    question = saved[0]
    assert question.reply_context["request"] == env.detail["text"]
    assert env.mail[0]["headers"]["Message-ID"] == question.message_id
    context = question.reply_context
    monkeypatch.setattr(agent, "reply_context", AsyncMock(return_value=context))
    env.detail.update(text="The appointment on Wednesday", message_id="<clarification-answer@test>")
    assert await run(env, refs=[question.message_id]) == "meeting_reply"
    assert env.action.call_args.kwargs["context"] == context
    assert "Thursday morning" in context["request"]


async def test_clarification_context_is_scoped_to_owner_sender_and_recent_references(env):
    env.db.scalar.return_value = {"sender": env.booking.visitor_email, "request": "Move to Thursday"}
    context = await REPLY_CONTEXT(env.db, env.owner, env.booking.visitor_email, ["<question@test>"], NOW)
    assert context["request"] == "Move to Thursday"
    params = env.db.scalar.call_args.args[0].compile().params
    assert env.owner.id in params.values() and env.booking.visitor_email in params.values()
    env.db.scalar.return_value = {"sender": "intruder@example.com"}
    assert await REPLY_CONTEXT(env.db, env.owner, env.booking.visitor_email, ["<question@test>"], NOW) is None


async def test_find_booking_scopes_thread_and_reply_address_to_host(env, monkeypatch):
    env.db.execute.return_value = Result(env.booking)
    env.detail["to"] = [agent.reply_address(env.booking)]
    found = await FIND_BOOKING(env.db, env.owner, [agent.confirmation_id(env.booking, "guest")], env.detail)
    assert found is env.booking
    query = str(env.db.execute.call_args.args[0])
    assert "bookings.host_user_id" in query and "FOR UPDATE" in query
    assert env.owner.id in env.db.execute.call_args.args[0].compile().params.values()


async def test_reply_address_without_references_does_not_generate_empty_pg_array(env):
    env.db.execute.return_value = Result(env.booking)
    env.detail["to"] = [agent.reply_address(env.booking)]
    assert await FIND_BOOKING(env.db, env.owner, [], env.detail) is env.booking
    assert "ARRAY[]" not in str(env.db.execute.call_args.args[0])


@pytest.mark.parametrize("intent", ["reschedule", "cancel"])
async def test_cc_request_routes_to_booking_agent(env, monkeypatch, intent):
    env.db.get.return_value = env.owner
    @asynccontextmanager
    async def session():
        yield env.db
    monkeypatch.setattr(meeting_agent, "async_session", session)
    monkeypatch.setattr(meeting_agent, "_find_meeting", AsyncMock(return_value=None))
    request = meeting_agent.MeetingRequest(intent=intent, title="Consultation")
    monkeypatch.setattr(meeting_agent, "read_request", AsyncMock(return_value=request))
    handler = AsyncMock(side_effect=[None, "meeting_reply"])
    monkeypatch.setattr(agent, "handle", handler)
    env.detail["headers"]["To"] = env.owner.email
    assert await meeting_agent.handle(env.owner.id, env.detail, NOW) == "meeting_reply"
    assert handler.call_args.kwargs["request"] is request


async def test_offer_constraints_use_event_availability_and_exclude_current(env, monkeypatch):
    slots = [datetime(2026, 10, 29, h, tzinfo=timezone.utc).isoformat() for h in (12, 13, 14, 15, 16, 17)]
    available = AsyncMock(return_value=slots)
    monkeypatch.setattr(agent, "get_available_slots", available)
    monkeypatch.setattr(agent, "freshen_host_calendars", AsyncMock())
    action = agent.BookingAction(intent="reschedule", earliest_date="2026-10-29", latest_date="2026-10-29", time_of_day="morning")
    options = await agent.open_times(env.db, env.owner, env.booking, env.event, action, NOW)
    assert len(options) == 3
    assert all(s.astimezone(meeting_agent.host_zone(env.owner)).hour < 12 for s in options)
    available.assert_awaited_once()
    assert available.call_args.kwargs["exclude_booking_id"] == env.booking.id


async def test_confirmations_have_stable_ids_and_inbound_reply_address(env):
    await mail.send_booking_confirmation(env.booking, env.event, env.owner)
    assert [m["headers"]["Message-ID"] for m in env.mail] == [
        agent.confirmation_id(env.booking, "guest"), agent.confirmation_id(env.booking, "host")]
    assert all(m["reply_to"] == agent.reply_address(env.booking) for m in env.mail)


@pytest.mark.parametrize("zone,clock,expected_hour", [(None, "10:00", 14), ("America/Los_Angeles", "09:00", 16)])
async def test_offers_honor_exact_times_and_explicit_timezone(env, monkeypatch, zone, clock, expected_hour):
    slots = [datetime(2026, 10, 29, h, tzinfo=timezone.utc).isoformat() for h in range(12, 22)]
    monkeypatch.setattr(agent, "get_available_slots", AsyncMock(return_value=slots))
    monkeypatch.setattr(agent, "freshen_host_calendars", AsyncMock())
    action = agent.BookingAction(intent="reschedule", earliest_date="2026-10-29", latest_date="2026-10-29",
                                 earliest_time=clock, latest_time=clock, timezone=zone)
    options = await agent.open_times(env.db, env.owner, env.booking, env.event, action, NOW)
    assert options == [datetime(2026, 10, 29, expected_hour, tzinfo=timezone.utc)]


async def test_expired_offer_cannot_be_picked(env, monkeypatch):
    env.booking.reschedule_offers = {"<offer@test>": {"starts": [(NOW + timedelta(days=3)).isoformat()],
                                                     "created_at": (NOW - timedelta(days=8)).isoformat()}}
    env.action.return_value = agent.BookingAction(intent="pick")
    pick = AsyncMock()
    monkeypatch.setattr(meeting_agent, "read_reply", pick)
    assert await run(env, refs=["<offer@test>"]) == "meeting_reply"
    pick.assert_not_awaited()
    assert env.booking.status == "confirmed"


@pytest.mark.parametrize("intent", ["reschedule", "cancel"])
async def test_general_request_parser_routes_existing_booking_intents(monkeypatch, intent):
    parse = AsyncMock(return_value=meeting_agent.MeetingRequest(intent=intent, title="Call"))
    monkeypatch.setattr(meeting_agent, "_parse", parse)
    parsed = await meeting_agent.read_request("Call", "Please move this to Thursday", "UTC", NOW.date())
    assert parsed.intent == intent
    assert "reschedule" in parse.call_args.args[0] and "cancel" in parse.call_args.args[0]
