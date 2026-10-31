"""cc TimeIQ: schedule a meeting from an email thread.

Someone (the account owner, or a person emailing them) cc's the owner's TimeIQ
address on a thread. TimeIQ reads the request, creates a group meeting with
everyone on the thread, and replies to all with a few of the owner's free
times and a personal link per person. People answer by tapping their link or
by replying in plain words; TimeIQ reads the reply and records it. When
everyone has answered, the owner is told on the thread and can reply "book
it", which sends the calendar invite to everyone.

Safety rules:
- The owner must be on the thread (sender or recipient); otherwise ignored.
- Booking by email only happens when the owner's message passes DMARC (or
  DKIM), so a forged "book it" can't book anything.
- Auto-replies and TimeIQ's own mail are ignored, so there are no reply loops.
- No email to the thread carries a participant's link (the link is that
  person's credential): each guest gets their own email with their own link.
- One email that reaches several TimeIQ inboxes is acted on once: its
  Message-ID is claimed by a single owner (see _preferred_owner).
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo
from email.utils import getaddresses, parseaddr
from typing import Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import array, insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.group_meeting import AgentMessageClaim, GroupMeeting, GroupMeetingParticipant
from app.models.user import User
from app.services import group_meetings as gm
from app.services.email_aliases import owner_addresses, sender_user
from app.services.availability import host_zone

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-5-5"
MAX_MEETINGS_PER_DAY = 25
MAX_OPTIONS_IN_PROMPT = 80
TIME_OF_DAY = {
    "morning": (8 * 60, 12 * 60),
    "afternoon": (12 * 60, 17 * 60),
    "evening": (17 * 60, 21 * 60),
}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ---------------------------------------------------------------------------
# Reading the email
# ---------------------------------------------------------------------------

def _addresses(*fields) -> list[tuple[str, str]]:
    raw: list[str] = []
    for f in fields:
        if not f:
            continue
        raw += f if isinstance(f, list) else [f]
    out: list[tuple[str, str]] = []
    # One value at a time: strict getaddresses (Python 3.11.10+) discards the
    # whole list when any value in it is malformed.
    for name, email in (pair for value in raw if value for pair in getaddresses([value])):
        email = email.strip().lower()
        if email and "@" in email and all(e != email for _, e in out):
            out.append((name.strip().strip('"'), email))
    return out


def _header(detail: dict, name: str) -> str:
    headers = detail.get("headers") or {}
    value = next((v for k, v in headers.items() if k.lower() == name.lower()), "")
    return " ".join(value) if isinstance(value, list) else str(value)


def thread_refs(detail: dict) -> list[str]:
    """Message-IDs this email replies to, plus its own."""
    ids = re.findall(r"<[^<>\s]+>", f"{_header(detail, 'references')} {_header(detail, 'in-reply-to')}")
    own = detail.get("message_id") or _header(detail, "message-id")
    if own:
        ids.append(own.strip())
    seen: list[str] = []
    # Outgoing messages carry a random suffix; their durable anchor is on the
    # meeting, so even a reply containing only In-Reply-To finds it.
    for i in list(ids):
        match = re.fullmatch(r"<timeiq-([0-9a-f]{32})\.[0-9a-f]{32}@" + re.escape(settings.INBOUND_DOMAIN) + r">", i, re.I)
        if match:
            ids.append(f"<timeiq-{match.group(1)}@{settings.INBOUND_DOMAIN}>")
    for i in ids:
        if i not in seen:
            seen.append(i)
    return seen


def is_auto_reply(detail: dict) -> bool:
    auto = _header(detail, "auto-submitted").lower()
    if auto and auto != "no":
        return True
    if _header(detail, "precedence").lower() in ("bulk", "junk", "list", "auto_reply"):
        return True
    if _header(detail, "x-autoreply") or _header(detail, "x-autorespond"):
        return True
    subject = (detail.get("subject") or "").lower()
    return subject.startswith(("out of office", "automatic reply", "auto-reply", "autoreply"))


def sender_address(detail: dict) -> str:
    return parseaddr(_header(detail, "from") or detail.get("from") or "")[1].strip().lower()


def sender_verified(detail: dict) -> bool:
    auth = detail.get("authentication") or {}
    return auth.get("dmarc") == "pass" or auth.get("dkim") == "pass"


def newest_text(text: str) -> str:
    """The new part of a reply, without the quoted history below it."""
    lines: list[str] = []
    for line in (text or "").splitlines():
        if line.startswith(">"):
            break
        if re.match(r"^\s*On .{4,200} wrote:\s*$", line) or re.match(r"^-{2,}\s*Original Message", line, re.I):
            break
        if re.match(r"^\s*From: .+", line) and lines:
            break
        lines.append(line)
    return "\n".join(lines).strip()[:4000]


def _ours(email: str) -> bool:
    return email.endswith("@" + settings.INBOUND_DOMAIN.lower())


# ---------------------------------------------------------------------------
# Claude
# ---------------------------------------------------------------------------

class ProposedTime(BaseModel):
    date: str = Field(description="YYYY-MM-DD")
    start_time: str = Field(description="24-hour HH:MM")
    timezone: Optional[str] = Field(None, description="IANA zone if the email states one for this time, else null")


class MeetingRequest(BaseModel):
    intent: Literal["find_time", "proposed_times", "schedule", "reschedule", "cancel", "other"] = Field(
        description="find_time: people want to set up a meeting and no specific times are offered yet. "
        "proposed_times: someone (a person, recruiter or another scheduling assistant) offers specific times "
        "and wants one picked. schedule: the email shares a schedule of events to add to a calendar "
        "(games, practices, classes). reschedule: move an existing booking. cancel: cancel an existing booking. other: anything else."
    )
    proposed: list[ProposedTime] = Field(default_factory=list, description="The specific times offered, if any")
    title: str = Field(description="Short meeting name, e.g. 'Pilot kickoff' or 'Coffee with Dana'")
    duration_minutes: Optional[int] = Field(None, description="Meeting length if stated or clearly implied")
    earliest_date: Optional[str] = Field(None, description="First acceptable day, YYYY-MM-DD, if stated")
    latest_date: Optional[str] = Field(None, description="Last acceptable day, YYYY-MM-DD, if stated")
    time_of_day: Literal["any", "morning", "afternoon", "evening"] = "any"
    avoid_days: list[Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]] = Field(
        default_factory=list, description="Weekdays the people said don't work"
    )
    location: Optional[str] = Field(None, description="Meeting place or video link if stated")


class ThreadReply(BaseModel):
    chosen_options: list[int] = Field(default_factory=list, description="Numbers of the offered times this person can make")
    other_options: list[int] = Field(
        default_factory=list,
        description="Numbers from the other open times that the writer named explicitly (never for vague answers)",
    )
    none_work: bool = Field(False, description="True if they said none of the times work")
    book: bool = Field(False, description="True if they ask to book, confirm or lock in a time")
    book_option: Optional[int] = Field(None, description="Number of the offered time to book, if they named one")


REQUEST_PROMPT = """You are TimeIQ, a scheduling assistant cc'd on an email thread. \
Decide whether the people on the thread want to find a time to meet, and if so \
pull out what they asked for. If the email offers specific times to choose from \
(for example an interview scheduler or another assistant listing slots), the intent \
is proposed_times: list every offered time, with its time zone when stated. Use \
today's date to resolve phrases like "next week" (Monday to Friday of the following \
week) or "Thursday". Requests to move or cancel an existing booking have intent \
reschedule or cancel. Leave fields empty when the email doesn't say."""

REPLY_PROMPT = """You are TimeIQ, a scheduling assistant on an email thread. \
TimeIQ offered the numbered times under "Times offered". Read the newest message \
and put the offered times the writer can make in chosen_options. "Any of those \
work" means every offered time; "the second one" means offered time 2; "Tuesday \
afternoon" means every offered Tuesday time after noon. When the writer names a \
specific time that wasn't offered, find it under "Other open times" and put its \
number in other_options; only do this for a time they name, never for a vague \
answer. A time in neither list doesn't count. If they ask to book, confirm or lock \
something in, set book, and book_option to the offered time they picked if any. \
Times are in {zone}; if the writer names another time zone, convert."""


async def _parse(system: str, text: str, schema):
    import anthropic  # slow to import; only email handling needs it

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.parse(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": text}],
        output_config={"effort": "low"},
        output_format=schema,
    )
    if response.stop_reason in ("refusal", "max_tokens") or response.parsed_output is None:
        logger.warning("Meeting agent parse stopped: %s", response.stop_reason)
        return None
    return response.parsed_output


async def read_request(subject: str, body: str, tz_name: str, today: date) -> MeetingRequest | None:
    return await _parse(
        REQUEST_PROMPT,
        f"Today is {today.isoformat()} ({today.strftime('%A')}). Time zone: {tz_name}.\n"
        f"Subject: {subject or '(none)'}\n\n{body or '(empty)'}",
        MeetingRequest,
    )


def option_lines(slots: list[datetime], tz) -> str:
    return "\n".join(f"{i}. {s.astimezone(tz).strftime('%a %b %-d, %-I:%M %p %Z')}" for i, s in enumerate(slots, 1))


async def read_reply(text: str, offered: list[datetime], others: list[datetime], tz) -> ThreadReply | None:
    """``offered`` are the times TimeIQ put in front of the writer, in order;
    ``others`` are further open times they may name explicitly."""
    # Name the zone as of the offered times (EST after a clock change, not today's EDT).
    first = (offered or others or [datetime.now(timezone.utc)])[0]
    abbr = first.astimezone(tz).strftime("%Z")
    lists = f"Times offered:\n{option_lines(offered, tz) or '(none)'}"
    if others:
        lists += f"\n\nOther open times:\n{option_lines(others, tz)}"
    return await _parse(
        REPLY_PROMPT.format(zone=abbr),
        f"{lists}\n\nNewest message:\n{text or '(empty)'}",
        ThreadReply,
    )


# ---------------------------------------------------------------------------
# Handling
# ---------------------------------------------------------------------------

def _window(req: MeetingRequest, today: date) -> tuple[date, date]:
    def parse(v):
        try:
            return date.fromisoformat(v) if v else None
        except ValueError:
            return None

    start = max(parse(req.earliest_date) or today, today)
    end = parse(req.latest_date) or start + timedelta(days=6)
    if end < start:
        end = start + timedelta(days=6)
    return start, min(end, start + timedelta(days=gm.MAX_WINDOW_DAYS - 1))


async def _find_meeting(db: AsyncSession, user_id, refs: list[str]) -> GroupMeeting | None:
    if not refs:
        return None
    return (
        await db.execute(
            select(GroupMeeting)
            .where((GroupMeeting.organizer_id == user_id) if user_id is not None else True, GroupMeeting.thread_ids.has_any(array(refs)))
            .order_by(GroupMeeting.created_at.desc())
        )
    ).scalars().first()


def _starts(values: list | None) -> list[datetime]:
    return [datetime.fromisoformat(v.replace("Z", "+00:00")) for v in values or []]


def record_offer(meeting: GroupMeeting, options: list[datetime]) -> None:
    """Remember exactly which times were offered, in order, on the meeting and
    for each participant, so a reply is read against what they were shown."""
    offered = [gm.iso(s) for s in options]
    meeting.offered_starts = offered
    for p in meeting.participants:
        p.offered_starts = list(offered)


async def _still_open(db: AsyncSession, meeting: GroupMeeting, starts: list[datetime], now: datetime) -> list[datetime]:
    """The starts that are still free on the organizer's calendar right now."""
    if not starts:
        return []
    windows = await gm._windows(db, meeting.organizer, meeting, now, default_hours=True)
    tz = host_zone(meeting.organizer)
    return [
        s for s in starts
        if s > now and gm._fits(s, meeting.duration_minutes, windows) and gm._allowed(s, meeting, tz)
    ]


def _inbound_tokens(detail: dict, people: list[tuple[str, str]]) -> set[str]:
    from app.services.email_import import token_from_recipients

    raw = [e for _, e in people] + list(detail.get("to") or []) + list(detail.get("cc") or [])
    return {t for t in (token_from_recipients([r]) for r in raw) if t}


async def shared_owner(db: AsyncSession, detail: dict) -> User | None:
    refs = thread_refs(detail)
    meeting = await _find_meeting(db, None, refs)
    if meeting is not None:
        return meeting.organizer
    # Booking replies keep their booking inbox alongside agent@.
    if refs:
        from app.models.booking import Booking

        booking_owner = (await db.execute(select(User).join(Booking, Booking.host_user_id == User.id).where(
            Booking.email_thread_ids.has_any(array(refs))
        ).order_by(Booking.created_at.desc()))).scalars().first()
        if booking_owner is not None:
            return booking_owner
        # Clarifications without a selected booking retain their reply context.
        owner_id = await db.scalar(select(AgentMessageClaim.user_id).where(
            AgentMessageClaim.message_id.in_(refs), AgentMessageClaim.reply_context.is_not(None),
            AgentMessageClaim.reply_context["sender"].astext == sender_address(detail),
        ).limit(1))
        if owner_id is not None:
            return await db.get(User, owner_id)
    return await sender_user(db, sender_address(detail)) if sender_verified(detail) else None


def _shared_address(detail: dict) -> str | None:
    from app.services.email_import import agent_address, has_agent_recipient

    return agent_address() if has_agent_recipient(detail.get("received_for") or []) else None


async def _preferred_owner(db: AsyncSession, detail: dict, people: list[tuple[str, str]], sender: str,
                           refs: list[str]):
    """The existing thread's organizer wins, then a sender owning an inbox."""
    from app.services.email_import import has_agent_recipient

    tokens = _inbound_tokens(detail, people)
    raw = [e for _, e in people] + list(detail.get("received_for") or [])
    shared = has_agent_recipient(raw)
    if shared:
        owner = await shared_owner(db, detail)
        if owner is not None:
            return owner.id
    if len(tokens) < 2:
        return None
    owners = (await db.execute(select(User.id).where(User.inbound_token.in_(tokens)))).scalars().all()
    if refs and owners:
        organizer = await db.scalar(
            select(GroupMeeting.organizer_id)
            .where(GroupMeeting.organizer_id.in_(owners), GroupMeeting.thread_ids.has_any(array(refs)))
            .order_by(GroupMeeting.created_at.desc()).limit(1)
        )
        if organizer is not None:
            return organizer
    sender_owner = await sender_user(db, sender)
    return sender_owner.id if sender_owner is not None and sender_owner.id in owners else None


def prepare_thread(meeting: GroupMeeting) -> None:
    if not any(re.fullmatch(r"<timeiq-[0-9a-f]{32}@" + re.escape(settings.INBOUND_DOMAIN) + r">", ref) for ref in meeting.thread_ids or []):
        meeting.thread_ids = [*(meeting.thread_ids or []), f"<timeiq-{uuid.uuid4().hex}@{settings.INBOUND_DOMAIN}>"]


async def claim_message(user_id, message_id: str | None, now: datetime, *, schedule_email_id: str | None = None) -> bool:
    """Take on an inbound Message-ID for this owner. False if any owner (this
    one included, for a second copy) already has it. Safe under concurrency:
    the primary key lets exactly one insert through."""
    if not message_id:
        return True
    async with async_session() as db:
        won = await db.scalar(
            pg_insert(AgentMessageClaim)
            .values(message_id=message_id.strip()[:500], user_id=user_id, created_at=now,
                    reply_context={"schedule_email_id": schedule_email_id} if schedule_email_id else None)
            .on_conflict_do_nothing(index_elements=["message_id"])
            .returning(AgentMessageClaim.message_id)
        )
        if won is None and schedule_email_id:
            claim = await db.get(AgentMessageClaim, message_id.strip()[:500])
            if claim and claim.user_id == user_id and (claim.reply_context or {}).get("schedule_email_id") == schedule_email_id:
                return True  # this import's own retry, rather than a second copy
        await db.commit()
    return won is not None


async def release_message(user_id, message_id: str | None) -> None:
    """Undo claim_message after a failure a redelivery should retry."""
    if not message_id:
        return
    async with async_session() as db:
        await db.execute(delete(AgentMessageClaim).where(
            AgentMessageClaim.message_id == message_id.strip()[:500],
            AgentMessageClaim.user_id == user_id,
        ))
        await db.commit()


async def handle(user_id, detail: dict, now: datetime | None = None) -> str | None:
    """Route one inbound email. Returns a status for the import log, or None
    when it isn't about a meeting (the caller imports it as a schedule)."""
    now = now or datetime.now(timezone.utc)
    if is_auto_reply(detail):
        return "ignored"
    # Resend's top-level to/cc list only the address that received this copy;
    # the real recipients (and display names) are in the headers.
    sender = sender_address(detail)
    refs = thread_refs(detail)
    people = _addresses(
        _header(detail, "from") or detail.get("from"),
        _header(detail, "to") or detail.get("to"),
        _header(detail, "cc") or detail.get("cc"),
    )

    async with async_session() as db:
        owner = await db.get(User, user_id)
        if owner is None or _ours(sender):
            return "ignored"
        owner_email = (owner.email or "").lower()
        emails = await owner_addresses(db, owner)
        preferred = await _preferred_owner(db, detail, people, sender, refs)
        if preferred is not None and preferred != owner.id:
            return "ignored"
        own_id = detail.get("message_id") or _header(detail, "message-id") or None
        from app.services import booking_agent

        routed = await booking_agent.handle(db, owner, detail, sender, refs, now)
        if routed is not None:
            return routed
        meeting = await _find_meeting(db, user_id, refs)
        if meeting is not None:
            if not await claim_message(owner.id, own_id, now):
                return "ignored"  # another copy of this email was handled already
            return await _handle_reply(db, owner, meeting, detail, sender, people, now)

        others = [(n, e) for n, e in people if e not in emails and not _ours(e)]
        if not others and not re.search(r"\b(cancel|reschedule|move)\b", newest_text(detail.get("text") or ""), re.I):
            return None  # just the owner and TimeIQ: a forwarded schedule
        if not emails.intersection(e for _, e in people):
            logger.info("Meeting request without the account owner on the thread; ignored")
            return "ignored"

        tz = host_zone(owner)
        today = now.astimezone(tz).date()
        req = await read_request(detail.get("subject") or "", newest_text(detail.get("text") or ""), str(tz), today)
        if req is not None and req.intent in ("reschedule", "cancel"):
            return await booking_agent.handle(db, owner, detail, sender, refs, now, request=req)
        if req is None or req.intent not in ("find_time", "proposed_times"):
            return None

        recent = await db.scalar(
            select(func.count()).select_from(GroupMeeting).where(
                GroupMeeting.organizer_id == owner.id, GroupMeeting.created_at > now - timedelta(days=1)
            )
        )
        if (recent or 0) >= MAX_MEETINGS_PER_DAY:
            return "ignored"

        # The same email in several TimeIQ inboxes starts one meeting.
        if not await claim_message(owner.id, own_id, now):
            return "ignored"

        if req.intent == "proposed_times" and req.proposed:
            return await _answer_proposal(db, owner, detail, req, others, refs, now)

        start, end = _window(req, today)
        span = TIME_OF_DAY.get(req.time_of_day)
        allowed = [i for i, d in enumerate(WEEKDAYS) if d not in set(req.avoid_days)]
        meeting = GroupMeeting(
            organizer_id=owner.id,
            title=(req.title or detail.get("subject") or "Meeting").strip()[:200],
            location=(req.location or "").strip()[:500] or None,
            duration_minutes=min(max(req.duration_minutes or 30, 15), 240),
            window_start=start,
            window_end=end,
            status="open",
            source="email",
            earliest_minute=span[0] if span else None,
            latest_minute=span[1] if span else None,
            weekdays=allowed if len(allowed) < 7 else None,
            thread_ids=refs,
            inbound_address=_shared_address(detail),
            thread_subject=(detail.get("subject") or "")[:500] or None,
        )
        meeting.participants = [
            GroupMeetingParticipant(email=e, name=n or None, token=gm.new_token()) for n, e in others[: gm.MAX_PARTICIPANTS]
        ]
        db.add(meeting)
        await db.flush()
        await db.refresh(meeting, attribute_names=["organizer", "participants"])
        slots = await gm.candidate_slots(db, meeting, now)
        options = gm.suggest(slots, {}, tz)
        record_offer(meeting, options)
        prepare_thread(meeting)
        await db.commit()

    from app.services import email as mail

    mail.send_agent_proposal(meeting, options, detail)
    return "meeting"


async def _handle_reply(db: AsyncSession, owner: User, meeting: GroupMeeting, detail: dict, sender: str,
                        people: list[tuple[str, str]], now: datetime) -> str:
    from app.services import email as mail

    own_id = detail.get("message_id")
    # The same message delivered twice (two Resend-hosted recipients): handled already.
    if own_id and own_id in (meeting.thread_ids or []):
        return "ignored"
    if own_id and own_id not in (meeting.thread_ids or []):
        meeting.thread_ids = [*(meeting.thread_ids or []), own_id]
    prepare_thread(meeting)
    if meeting.status != "open":
        await db.commit()
        return "meeting_reply"

    tz = host_zone(owner)
    candidates = await gm.candidate_slots(db, meeting, now)
    text = newest_text(detail.get("text") or "")
    owner_email = (owner.email or "").lower()

    def lists(offered_iso: list | None) -> tuple[list[datetime], list[datetime]]:
        """What the writer was offered, and the other open times they may name."""
        if offered_iso is None:  # a meeting from before offers were recorded
            return candidates[:MAX_OPTIONS_IN_PROMPT], []
        offered = _starts(offered_iso)
        return offered, [s for s in candidates if s not in offered][:MAX_OPTIONS_IN_PROMPT]

    if sender in await owner_addresses(db, owner):
        offered, others = lists(meeting.offered_starts)
        parsed = await read_reply(text, offered, others, tz)
        await db.commit()
        if not parsed or not parsed.book:
            return "meeting_reply"
        if not sender_verified(detail):
            mail.send_agent_note(
                meeting, detail, [owner_email],
                "I couldn't verify that this came from you, so I didn't book anything. Tap Book in TimeIQ instead.",
                link=True,
            )
            return "meeting_reply"
        target = None
        named = [others[i - 1] for i in parsed.other_options if 1 <= i <= len(others)]
        if parsed.book_option and 1 <= parsed.book_option <= len(offered):
            target = offered[parsed.book_option - 1]
        elif named:
            target = named[0]
        else:
            ranked = gm.rank(candidates, await gm.participant_answers(db, meeting, candidates, now))
            if ranked and ranked[0]["yes"] > 0:
                target = datetime.fromisoformat(ranked[0]["start"].replace("Z", "+00:00"))
        if target is None:
            mail.send_agent_note(meeting, detail, [owner_email], "Which time should I book? Reply with one, or tap Book in TimeIQ.", link=True)
            return "meeting_reply"
        try:
            await gm.book(db, meeting, target, now)
        except gm.GroupMeetingError as exc:
            await db.rollback()
            mail.send_agent_note(meeting, detail, [owner_email], f"I couldn't book that: {exc}", link=True)
            return "meeting_reply"
        await db.commit()
        mail.send_agent_booked(meeting, detail)
        return "meeting_booked"

    participant = next((p for p in meeting.participants if p.email == sender), None)
    if participant is None:
        # Someone new joined the thread: add them, if the owner is still on it.
        if not (await owner_addresses(db, owner)).intersection(e for _, e in people) or _ours(sender) or len(meeting.participants) >= gm.MAX_PARTICIPANTS:
            await db.commit()
            return "ignored"
        name = next((n for n, e in people if e == sender), "") or None
        participant = GroupMeetingParticipant(
            email=sender, name=name, token=gm.new_token(),
            offered_starts=list(meeting.offered_starts) if meeting.offered_starts is not None else None,
        )
        meeting.participants.append(participant)
        meeting.all_answered_notified_at = None
        await db.flush()

    if participant.uses_calendar:
        await db.commit()
        return "meeting_reply"
    own_offer = participant.offered_starts if participant.offered_starts is not None else meeting.offered_starts
    offered, others = lists(own_offer)
    parsed = await read_reply(text, offered, others, tz)
    if parsed is None:
        await db.commit()
        return "meeting_reply"
    chosen = [offered[i - 1] for i in parsed.chosen_options if 1 <= i <= len(offered)]
    chosen += [others[i - 1] for i in parsed.other_options if 1 <= i <= len(others)]
    chosen = sorted(set(chosen))
    # Offered times can fill up after the email went out: keep only those still free.
    picked = await _still_open(db, meeting, chosen, now)
    if chosen and not picked and not parsed.none_work:
        await db.commit()
        mail.send_agent_note(
            meeting, detail, [participant.email],
            "Sorry, that time was just taken. Tap your link in my earlier email to pick another, "
            "or reply with a different time.",
        )
        return "meeting_reply"
    if not picked and not parsed.none_work:
        await db.commit()
        return "meeting_reply"  # nothing about times; leave their answer as it was
    participant.available_starts = sorted({gm.iso(s) for s in picked})
    participant.responded_at = now
    await db.flush()
    await db.commit()
    mail.send_agent_ack(meeting, participant, picked, detail)
    await gm.notify_if_all_answered(db, meeting, now)
    return "meeting_reply"


def _proposed_datetimes(req: MeetingRequest, tz) -> list[datetime]:
    out: list[datetime] = []
    for p in req.proposed:
        try:
            zone = tz
            if p.timezone:
                try:
                    zone = ZoneInfo(p.timezone)
                except Exception:
                    pass
            h, m = (int(x) for x in p.start_time.split(":")[:2])
            out.append(datetime.combine(date.fromisoformat(p.date), dtime(h, m), tzinfo=zone).astimezone(timezone.utc))
        except (ValueError, TypeError):
            continue
    return sorted(set(out))


async def _answer_proposal(db: AsyncSession, owner: User, detail: dict, req: MeetingRequest,
                           others: list[tuple[str, str]], refs: list[str], now: datetime) -> str:
    """Someone offered specific times: accept the first one the owner is free
    for, or say none work and offer three of the owner's own."""
    from app.services import email as mail
    from app.services.free_time import free_windows

    tz = host_zone(owner)
    minutes = min(max(req.duration_minutes or 30, 15), 240)
    offered = [t for t in _proposed_datetimes(req, tz) if t > now]
    title = (req.title or detail.get("subject") or "Meeting").strip()[:200]
    common = dict(
        organizer_id=owner.id, title=title, location=(req.location or "").strip()[:500] or None,
        duration_minutes=minutes, source="accepted", thread_ids=refs,
        inbound_address=_shared_address(detail),
        thread_subject=(detail.get("subject") or "")[:500] or None,
    )
    def people() -> list[GroupMeetingParticipant]:
        return [GroupMeetingParticipant(email=e, name=n or None, token=gm.new_token()) for n, e in others[: gm.MAX_PARTICIPANTS]]

    free: list[datetime] = []
    if offered:
        days = min((offered[-1].astimezone(tz).date() - now.astimezone(tz).date()).days + 1, 90)
        windows = [
            (datetime.fromisoformat(w["start"]), datetime.fromisoformat(w["end"]))
            for d in await free_windows(db, owner, days=max(days, 1), min_minutes=minutes, now=now, default_hours=True)
            for w in d["windows"]
        ]
        free = [t for t in offered if gm._fits(t, minutes, windows)]

    if free:
        pick = free[0]
        meeting = GroupMeeting(
            **common, status="booked", starts_at=pick, ends_at=pick + timedelta(minutes=minutes),
            window_start=pick.astimezone(tz).date(), window_end=pick.astimezone(tz).date(),
        )
        meeting.participants = people()
        db.add(meeting)
        await db.flush()
        try:
            await gm.hold(db, meeting, now)
        except gm.GroupMeetingError:
            # Taken since we looked (hold rechecks under the host's lock): counter instead.
            await db.rollback()
            await db.refresh(owner)  # rollback expired it; no lazy loads in async
        else:
            await db.refresh(meeting, attribute_names=["organizer", "participants"])
            prepare_thread(meeting)
            await db.commit()
            mail.send_agent_accept(meeting, detail)
            return "meeting_accepted"

    # None of the offered times work: offer the owner's own, Luna-style.
    today = now.astimezone(tz).date()
    start = max(offered[0].astimezone(tz).date() if offered else today, today)
    meeting = GroupMeeting(
        **{**common, "source": "email"}, status="open",
        window_start=start, window_end=start + timedelta(days=6),
    )
    meeting.participants = people()
    db.add(meeting)
    await db.flush()
    await db.refresh(meeting, attribute_names=["organizer", "participants"])
    slots = await gm.candidate_slots(db, meeting, now)
    options = gm.suggest(slots, {}, tz)
    record_offer(meeting, options)
    prepare_thread(meeting)
    await db.commit()
    org = mail._first_name(owner)
    mail.send_agent_proposal(
        meeting, options, detail,
        intro=f"Thanks for the options. Unfortunately none of them work for {org}.",
    )
    return "meeting"
