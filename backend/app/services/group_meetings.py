"""Find a time with several people.

The organizer's free slots in a date window are the candidates. Each
participant either shares their TimeIQ free/busy (computed live from their
calendars and working hours) or ticks the candidates that work for them. No
participant ever sees anyone's events, only how many people can make a slot.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.models.group_meeting import GroupMeeting, GroupMeetingParticipant
from app.models.user import User
from app.services.availability import BOOKING_HORIZON_DAYS, host_zone
from app.services.free_time import free_windows

SLOT_STEP_MINUTES = 30
MAX_SLOTS = 160
MAX_PARTICIPANTS = 20
MAX_WINDOW_DAYS = 21
SOURCE_TYPE = "meetings"
SOURCE_NAME = "TimeIQ group meetings"

Window = tuple[datetime, datetime]


class GroupMeetingError(Exception):
    """A request the meeting can't take; the message is shown to the user."""


def new_token() -> str:
    return secrets.token_urlsafe(24)


def _days_until(meeting: GroupMeeting, today: date) -> int:
    return (meeting.window_end - today).days + 1


async def _windows(db: AsyncSession, user: User, meeting: GroupMeeting, now: datetime, *, default_hours: bool) -> list[Window]:
    """The user's open stretches inside the meeting's window, in UTC."""
    today = now.astimezone(host_zone(user)).date()
    days = min(_days_until(meeting, today), BOOKING_HORIZON_DAYS)
    if days <= 0:
        return []
    out: list[Window] = []
    for day in await free_windows(
        db, user, days=days, min_minutes=meeting.duration_minutes, now=now, default_hours=default_hours
    ):
        if day["date"] < meeting.window_start.isoformat():
            continue
        for w in day["windows"]:
            out.append((datetime.fromisoformat(w["start"]), datetime.fromisoformat(w["end"])))
    return out


def _slots_in(windows: list[Window], minutes: int) -> list[datetime]:
    """Starts on the half-hour grid where a meeting of ``minutes`` fits."""
    length = timedelta(minutes=minutes)
    step = timedelta(minutes=SLOT_STEP_MINUTES)
    starts: list[datetime] = []
    for w_start, w_end in windows:
        t = w_start.astimezone(timezone.utc)
        extra = (t.minute % SLOT_STEP_MINUTES) * 60 + t.second
        if extra:
            t += timedelta(seconds=SLOT_STEP_MINUTES * 60 - extra)
        t = t.replace(microsecond=0)
        while t + length <= w_end:
            starts.append(t)
            t += step
    return sorted(set(starts))[:MAX_SLOTS]


def _fits(start: datetime, minutes: int, windows: list[Window]) -> bool:
    end = start + timedelta(minutes=minutes)
    return any(w_start <= start and end <= w_end for w_start, w_end in windows)


def _allowed(start: datetime, meeting: GroupMeeting, tz) -> bool:
    """The meeting's optional time-of-day and weekday limits, in the organizer's zone."""
    local = start.astimezone(tz)
    if meeting.weekdays and local.weekday() not in meeting.weekdays:
        return False
    begin = local.hour * 60 + local.minute
    if meeting.earliest_minute is not None and begin < meeting.earliest_minute:
        return False
    if meeting.latest_minute is not None and begin + meeting.duration_minutes > meeting.latest_minute:
        return False
    return True


async def candidate_slots(db: AsyncSession, meeting: GroupMeeting, now: datetime | None = None) -> list[datetime]:
    now = now or datetime.now(timezone.utc)
    windows = await _windows(db, meeting.organizer, meeting, now, default_hours=True)
    tz = host_zone(meeting.organizer)
    return [s for s in _slots_in(windows, meeting.duration_minutes) if _allowed(s, meeting, tz)]


def spread(slots: list[datetime], tz, limit: int = 6, per_day: int = 2) -> list[datetime]:
    """A few options to offer in words: at most per_day a day, spaced apart."""
    picked: list[datetime] = []
    by_day: dict = {}
    for s in sorted(slots):
        day = s.astimezone(tz).date()
        mine = by_day.setdefault(day, [])
        if len(mine) >= per_day or any(abs((s - m).total_seconds()) < 3 * 3600 for m in mine):
            continue
        mine.append(s)
        picked.append(s)
        if len(picked) >= limit:
            break
    return picked


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def participant_answers(
    db: AsyncSession, meeting: GroupMeeting, slots: list[datetime], now: datetime | None = None
) -> dict[str, dict[str, bool | None]]:
    """participant id -> slot ISO -> True (can make it), False (can't) or None (hasn't answered)."""
    now = now or datetime.now(timezone.utc)
    out: dict[str, dict[str, bool | None]] = {}
    for p in meeting.participants:
        answers: dict[str, bool | None] = {}
        if p.uses_calendar and p.user_id:
            user = await db.get(User, p.user_id)
            windows = await _windows(db, user, meeting, now, default_hours=True) if user else []
            for s in slots:
                answers[iso(s)] = _fits(s, meeting.duration_minutes, windows)
        elif p.responded_at:
            picked = set(p.available_starts or [])
            for s in slots:
                answers[iso(s)] = iso(s) in picked
        else:
            for s in slots:
                answers[iso(s)] = None
        out[str(p.id)] = answers
    return out


def rank(slots: list[datetime], answers: dict[str, dict[str, bool | None]]) -> list[dict]:
    """Slots with yes/no/pending counts, best first: most yeses, then fewest
    no's, then earliest."""
    rows = []
    for s in slots:
        key = iso(s)
        votes = [a.get(key) for a in answers.values()]
        rows.append({
            "start": key,
            "yes": sum(v is True for v in votes),
            "no": sum(v is False for v in votes),
            "pending": sum(v is None for v in votes),
        })
    return sorted(rows, key=lambda r: (-r["yes"], r["no"], r["start"]))


def all_answered(meeting: GroupMeeting) -> bool:
    return bool(meeting.participants) and all(p.responded_at for p in meeting.participants)


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

async def _meetings_source(db: AsyncSession, user_id) -> CalendarSource:
    source = (
        await db.execute(
            select(CalendarSource).where(CalendarSource.user_id == user_id, CalendarSource.type == SOURCE_TYPE)
        )
    ).scalars().first()
    if source is None:
        source = CalendarSource(user_id=user_id, type=SOURCE_TYPE, name=SOURCE_NAME, is_active=True)
        db.add(source)
        await db.flush()
    return source


def calendar_user_ids(meeting: GroupMeeting) -> list:
    """Every TimeIQ account whose calendar gets the booked meeting."""
    ids = [meeting.organizer_id]
    for p in meeting.participants:
        if p.user_id and p.user_id not in ids:
            ids.append(p.user_id)
    return ids


async def book(db: AsyncSession, meeting: GroupMeeting, start: datetime, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    if meeting.status != "open":
        raise GroupMeetingError("This meeting is already booked or cancelled.")
    start = start.astimezone(timezone.utc)
    if start <= now:
        raise GroupMeetingError("That time has already passed.")
    if start not in await candidate_slots(db, meeting, now):
        raise GroupMeetingError("That time is no longer free on your calendar. Pick another.")
    meeting.status = "booked"
    meeting.starts_at = start
    meeting.ends_at = start + timedelta(minutes=meeting.duration_minutes)
    for user_id in calendar_user_ids(meeting):
        source = await _meetings_source(db, user_id)
        db.add(CachedEvent(
            calendar_source_id=source.id,
            user_id=user_id,
            group_meeting_id=meeting.id,
            title=meeting.title,
            starts_at=meeting.starts_at,
            ends_at=meeting.ends_at,
            is_all_day=False,
            external_id=f"group-{meeting.id}",
        ))
    await db.flush()


async def cancel(db: AsyncSession, meeting: GroupMeeting) -> bool:
    """Cancel the meeting. Returns True if it had been booked (invites must be withdrawn)."""
    if meeting.status == "cancelled":
        raise GroupMeetingError("This meeting is already cancelled.")
    was_booked = meeting.status == "booked"
    await db.execute(delete(CachedEvent).where(CachedEvent.group_meeting_id == meeting.id))
    meeting.status = "cancelled"
    meeting.ical_sequence = (meeting.ical_sequence or 0) + 1
    await db.flush()
    return was_booked


async def notify_if_all_answered(db: AsyncSession, meeting: GroupMeeting, now: datetime | None = None) -> None:
    """Tell the organizer once, when the last person answers."""
    from app.services import email as mail

    now = now or datetime.now(timezone.utc)
    if meeting.status != "open" or meeting.all_answered_notified_at or not all_answered(meeting):
        return
    candidates = await candidate_slots(db, meeting, now)
    ranked = rank(candidates, await participant_answers(db, meeting, candidates, now))
    meeting.all_answered_notified_at = now
    await db.commit()
    mail.send_group_all_answered(meeting, ranked[0] if ranked else None)
