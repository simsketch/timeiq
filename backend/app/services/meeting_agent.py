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
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo
from email.utils import getaddresses, parseaddr
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.group_meeting import GroupMeeting, GroupMeetingParticipant
from app.models.user import User
from app.services import group_meetings as gm
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
    for name, email in getaddresses(raw):
        email = email.strip().lower()
        if email and "@" in email and all(e != email for _, e in out):
            out.append((name.strip().strip('"'), email))
    return out


def _header(detail: dict, name: str) -> str:
    headers = detail.get("headers") or {}
    value = headers.get(name) or headers.get(name.title()) or ""
    return " ".join(value) if isinstance(value, list) else str(value)


def thread_refs(detail: dict) -> list[str]:
    """Message-IDs this email replies to, plus its own."""
    ids = re.findall(r"<[^<>\s]+>", f"{_header(detail, 'references')} {_header(detail, 'in-reply-to')}")
    own = detail.get("message_id") or _header(detail, "message-id")
    if own:
        ids.append(own.strip())
    seen: list[str] = []
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
    intent: Literal["find_time", "proposed_times", "schedule", "other"] = Field(
        description="find_time: people want to set up a meeting and no specific times are offered yet. "
        "proposed_times: someone (a person, recruiter or another scheduling assistant) offers specific times "
        "and wants one picked. schedule: the email shares a schedule of events to add to a calendar "
        "(games, practices, classes). other: anything else."
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
    chosen_options: list[int] = Field(default_factory=list, description="Numbers of the listed times this person can make")
    none_work: bool = Field(False, description="True if they said none of the times work")
    book: bool = Field(False, description="True if they ask to book, confirm or lock in a time")
    book_option: Optional[int] = Field(None, description="Number of the time to book, if they named one")


REQUEST_PROMPT = """You are TimeIQ, a scheduling assistant cc'd on an email thread. \
Decide whether the people on the thread want to find a time to meet, and if so \
pull out what they asked for. If the email offers specific times to choose from \
(for example an interview scheduler or another assistant listing slots), the intent \
is proposed_times: list every offered time, with its time zone when stated. Use \
today's date to resolve phrases like "next week" (Monday to Friday of the following \
week) or "Thursday". Leave fields empty when the email doesn't say."""

REPLY_PROMPT = """You are TimeIQ, a scheduling assistant on an email thread. \
TimeIQ offered the numbered times below. Read the newest message and say which \
of those times the writer can make. "Any of those work" means all of them. \
"Tuesday afternoon" means every listed Tuesday time after noon. A time they name \
that isn't listed doesn't count. If they ask to book, confirm or lock something \
in, set book, and book_option to the time they picked if any. Times are in \
{zone}; if the writer names another time zone, convert."""


async def _parse(system: str, text: str, schema):
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


async def read_reply(text: str, slots: list[datetime], tz) -> ThreadReply | None:
    # Name the zone as of the offered times (EST after a clock change, not today's EDT).
    abbr = (slots[0] if slots else datetime.now(timezone.utc)).astimezone(tz).strftime("%Z")
    return await _parse(
        REPLY_PROMPT.format(zone=abbr),
        f"Times offered:\n{option_lines(slots, tz)}\n\nNewest message:\n{text or '(empty)'}",
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
            .where(GroupMeeting.organizer_id == user_id, GroupMeeting.thread_ids.has_any(array(refs)))
            .order_by(GroupMeeting.created_at.desc())
        )
    ).scalars().first()


async def handle(user_id, detail: dict, now: datetime | None = None) -> str | None:
    """Route one inbound email. Returns a status for the import log, or None
    when it isn't about a meeting (the caller imports it as a schedule)."""
    now = now or datetime.now(timezone.utc)
    if is_auto_reply(detail):
        return "ignored"
    # Resend's top-level to/cc list only the address that received this copy;
    # the real recipients (and display names) are in the headers.
    sender = parseaddr(_header(detail, "from") or detail.get("from") or "")[1].strip().lower()
    refs = thread_refs(detail)
    people = _addresses(
        _header(detail, "from") or detail.get("from"),
        _header(detail, "to") or detail.get("to"),
        _header(detail, "cc") or detail.get("cc"),
    )

    async with async_session() as db:
        owner = await db.get(User, user_id)
        owner_email = (owner.email or "").lower()
        meeting = await _find_meeting(db, user_id, refs)
        if meeting is not None:
            return await _handle_reply(db, owner, meeting, detail, sender, people, now)

        others = [(n, e) for n, e in people if e != owner_email and not _ours(e)]
        if not others:
            return None  # just the owner and TimeIQ: a forwarded schedule
        if owner_email not in {e for _, e in people}:
            logger.info("Meeting request without the account owner on the thread; ignored")
            return "ignored"

        tz = host_zone(owner)
        today = now.astimezone(tz).date()
        req = await read_request(detail.get("subject") or "", newest_text(detail.get("text") or ""), str(tz), today)
        if req is None or req.intent not in ("find_time", "proposed_times"):
            return None

        recent = await db.scalar(
            select(func.count()).select_from(GroupMeeting).where(
                GroupMeeting.organizer_id == owner.id, GroupMeeting.created_at > now - timedelta(days=1)
            )
        )
        if (recent or 0) >= MAX_MEETINGS_PER_DAY:
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
            thread_subject=(detail.get("subject") or "")[:500] or None,
        )
        meeting.participants = [
            GroupMeetingParticipant(email=e, name=n or None, token=gm.new_token()) for n, e in others[: gm.MAX_PARTICIPANTS]
        ]
        db.add(meeting)
        await db.flush()
        await db.refresh(meeting, attribute_names=["organizer", "participants"])
        slots = await gm.candidate_slots(db, meeting, now)
        await db.commit()

    from app.services import email as mail

    mail.send_agent_proposal(meeting, gm.suggest(slots, {}, tz), detail)
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
    if meeting.status != "open":
        await db.commit()
        return "meeting_reply"

    tz = host_zone(owner)
    slots = (await gm.candidate_slots(db, meeting, now))[:MAX_OPTIONS_IN_PROMPT]
    text = newest_text(detail.get("text") or "")
    owner_email = (owner.email or "").lower()

    if sender == owner_email:
        parsed = await read_reply(text, slots, tz)
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
        if parsed.book_option and 1 <= parsed.book_option <= len(slots):
            target = slots[parsed.book_option - 1]
        else:
            ranked = gm.rank(slots, await gm.participant_answers(db, meeting, slots, now))
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
        if owner_email not in {e for _, e in people} or _ours(sender) or len(meeting.participants) >= gm.MAX_PARTICIPANTS:
            await db.commit()
            return "ignored"
        name = next((n for n, e in people if e == sender), "") or None
        participant = GroupMeetingParticipant(email=sender, name=name, token=gm.new_token())
        meeting.participants.append(participant)
        meeting.all_answered_notified_at = None
        await db.flush()

    if participant.uses_calendar:
        await db.commit()
        return "meeting_reply"
    parsed = await read_reply(text, slots, tz)
    if parsed is None:
        await db.commit()
        return "meeting_reply"
    picked = [slots[i - 1] for i in parsed.chosen_options if 1 <= i <= len(slots)]
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
        thread_subject=(detail.get("subject") or "")[:500] or None,
    )
    people = [GroupMeetingParticipant(email=e, name=n or None, token=gm.new_token()) for n, e in others[: gm.MAX_PARTICIPANTS]]

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
        meeting.participants = people
        db.add(meeting)
        await db.flush()
        await gm.hold(db, meeting)
        await db.refresh(meeting, attribute_names=["organizer", "participants"])
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
    meeting.participants = people
    db.add(meeting)
    await db.flush()
    await db.refresh(meeting, attribute_names=["organizer", "participants"])
    slots = await gm.candidate_slots(db, meeting, now)
    await db.commit()
    org = mail._first_name(owner)
    mail.send_agent_proposal(
        meeting, gm.suggest(slots, {}, tz), detail,
        intro=f"Thanks for the options. Unfortunately none of them work for {org}.",
    )
    return "meeting"
