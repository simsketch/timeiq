from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.availability_rule import AvailabilityRule
from app.models.booking import Booking
from app.models.cached_event import CachedEvent
from app.models.event_type import EventType
from app.models.user import User

import zoneinfo

# How far ahead guests can book. Calendar sync caches 90 days of events, so a
# later slot could hide a conflict we have never seen.
BOOKING_HORIZON_DAYS = 90

# The largest buffer an event type can have (EventTypeCreate caps it at 120).
# Busy queries widen their window by this much so a neighbouring booking's
# buffer reaches across the edges of the day's rule.
MAX_BUFFER_MINUTES = 120


def booking_horizon(now: datetime | None = None) -> datetime:
    """The latest instant a booking may start."""
    return (now or datetime.now(timezone.utc)) + timedelta(days=BOOKING_HORIZON_DAYS)


def booking_window_error(event_type: EventType, starts_at: datetime, now: datetime | None = None) -> str | None:
    now = now or datetime.now(timezone.utc)
    if starts_at <= now:
        return "This time has passed. Choose a future time."
    notice = getattr(event_type, "min_notice_minutes", 0) or 0
    if starts_at < now + timedelta(minutes=notice):
        return f"This meeting needs at least {notice} minutes of notice. Choose a later time."
    days = getattr(event_type, "max_days_ahead", None) or BOOKING_HORIZON_DAYS
    if starts_at > now + timedelta(days=min(days, BOOKING_HORIZON_DAYS)):
        return f"Bookings can be made up to {days} days ahead. Choose an earlier date."
    return None


def host_zone(host: User) -> zoneinfo.ZoneInfo:
    try:
        return zoneinfo.ZoneInfo(host.timezone)
    except Exception:
        return zoneinfo.ZoneInfo("America/New_York")


async def get_available_slots(
    db: AsyncSession,
    host: User,
    event_type: EventType,
    target_date: date,
    *,
    debug: bool = False,
    exclude_booking_id: uuid.UUID | None = None,
) -> list[str] | dict:
    """
    Compute available time slots for a given host, event type, and date.

    Returns a list of ISO 8601 datetime strings (in the host's zone) representing
    available slot start times.
    If debug=True, returns a dict with full diagnostic information.
    exclude_booking_id ignores one booking, so a reschedule can reuse its own time.
    """
    debug_info: dict = {}

    # Determine the day of week for the target date (Monday=0, Sunday=6)
    day_of_week = target_date.weekday()

    # 1. Get the availability rule for this day
    result = await db.execute(
        select(AvailabilityRule).where(
            and_(
                AvailabilityRule.user_id == host.id,
                AvailabilityRule.day_of_week == day_of_week,
                AvailabilityRule.is_active.is_(True),
            )
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        if debug:
            return {"error": f"No active availability rule for day_of_week={day_of_week}"}
        return []

    host_tz = host_zone(host)

    # 2. Generate candidate slots. The rule boundaries are wall-clock times in
    # the host's zone; everything else steps in UTC elapsed time, so a fall-back
    # day offers both 01:00 hours and every slot really lasts `duration`.
    rule_start = datetime.combine(target_date, rule.start_time, tzinfo=host_tz)
    rule_end = datetime.combine(target_date, rule.end_time, tzinfo=host_tz)
    rule_start_utc = rule_start.astimezone(timezone.utc)
    rule_end_utc = rule_end.astimezone(timezone.utc)
    duration = timedelta(minutes=event_type.duration_minutes)
    buffer = timedelta(minutes=event_type.buffer_minutes)

    if debug:
        debug_info["rule_start"] = rule_start.isoformat()
        debug_info["rule_end"] = rule_end.isoformat()
        debug_info["duration_minutes"] = event_type.duration_minutes
        debug_info["buffer_minutes"] = event_type.buffer_minutes
        debug_info["host_timezone"] = str(host_tz)

    candidates: list[datetime] = []
    current = rule_start_utc
    while current + duration <= rule_end_utc:
        candidates.append(current)
        current += duration

    if debug:
        debug_info["total_candidates"] = len(candidates)
        if candidates:
            debug_info["first_candidate"] = candidates[0].astimezone(host_tz).isoformat()
            debug_info["last_candidate"] = candidates[-1].astimezone(host_tz).isoformat()

    if not candidates:
        if debug:
            return debug_info
        return []

    # 3. The query window in UTC, widened so buffers around events just outside
    # the rule still reach into it.
    widen = max(buffer, timedelta(minutes=MAX_BUFFER_MINUTES))
    window_start_utc = rule_start_utc - widen
    window_end_utc = rule_end_utc + widen

    # 4. Get cached calendar events that overlap this window
    ce_result = await db.execute(
        select(CachedEvent).where(
            and_(
                CachedEvent.user_id == host.id,
                CachedEvent.starts_at < window_end_utc,
                CachedEvent.ends_at > window_start_utc,
            )
        )
    )
    cached_events = ce_result.scalars().all()

    # 5. Existing confirmed bookings in the window, with their own buffers
    bk_result = await db.execute(
        select(Booking, EventType.buffer_minutes)
        .join(EventType, EventType.id == Booking.event_type_id)
        .where(
            and_(
                Booking.host_user_id == host.id,
                Booking.status == "confirmed",
                Booking.starts_at < window_end_utc,
                Booking.ends_at > window_start_utc,
                Booking.id != exclude_booking_id if exclude_booking_id else True,
            )
        )
    )
    booking_rows = bk_result.all()
    existing_bookings = [bk for bk, _ in booking_rows]

    # 6. Busy intervals (UTC). The proposed event type's buffer keeps a gap
    # around everything busy; an existing booking also keeps its own buffer.
    busy_intervals: list[tuple[datetime, datetime]] = []
    for ev in cached_events:
        busy_intervals.append((ev.starts_at - buffer, ev.ends_at + buffer))
    for bk, bk_buffer_minutes in booking_rows:
        gap = max(buffer, timedelta(minutes=bk_buffer_minutes or 0))
        busy_intervals.append((bk.starts_at - gap, bk.ends_at + gap))

    if debug:
        debug_info["cached_events"] = [
            {
                "title": ev.title,
                "starts_at": ev.starts_at.isoformat(),
                "ends_at": ev.ends_at.isoformat(),
            }
            for ev in cached_events
        ]
        debug_info["existing_bookings"] = [
            {
                "starts_at": bk.starts_at.isoformat(),
                "ends_at": bk.ends_at.isoformat(),
                "status": bk.status,
            }
            for bk in existing_bookings
        ]
        debug_info["busy_intervals"] = [
            {"start": s.isoformat(), "end": e.isoformat()}
            for s, e in busy_intervals
        ]

    # 7. Filter candidates
    available: list[str] = []
    rejected: list[dict] = []
    now_utc = datetime.now(timezone.utc)

    for slot_start_utc in candidates:
        slot_start = slot_start_utc.astimezone(host_tz)
        slot_end_utc = slot_start_utc + duration

        window_error = booking_window_error(event_type, slot_start_utc, now_utc)
        if window_error:
            if debug:
                rejected.append({
                    "slot": slot_start.isoformat(),
                    "reason": window_error,
                })
            continue

        is_free = True
        conflict_reason = None
        for busy_start, busy_end in busy_intervals:
            # Ensure busy times are tz-aware for comparison
            if busy_start.tzinfo is None:
                busy_start = busy_start.replace(tzinfo=timezone.utc)
            if busy_end.tzinfo is None:
                busy_end = busy_end.replace(tzinfo=timezone.utc)

            # Check overlap between slot and busy interval
            if slot_start_utc < busy_end and slot_end_utc > busy_start:
                is_free = False
                conflict_reason = f"conflicts with {busy_start.isoformat()} - {busy_end.isoformat()}"
                break

        if not is_free:
            if debug:
                rejected.append({
                    "slot": slot_start.isoformat(),
                    "reason": conflict_reason,
                })
            continue

        available.append(slot_start.isoformat())

    if debug:
        debug_info["available_count"] = len(available)
        debug_info["rejected"] = rejected

    # 8. Apply max_bookings_per_day limit
    if event_type.max_bookings_per_day is not None:
        # Count existing confirmed bookings for this event type on this host-local date
        day_start = datetime.combine(target_date, time.min, tzinfo=host_tz).astimezone(
            timezone.utc
        )
        day_end = datetime.combine(
            target_date + timedelta(days=1), time.min, tzinfo=host_tz
        ).astimezone(timezone.utc)
        count_result = await db.execute(
            select(func.count(Booking.id)).where(
                and_(
                    Booking.event_type_id == event_type.id,
                    Booking.host_user_id == host.id,
                    Booking.status == "confirmed",
                    Booking.starts_at >= day_start,
                    Booking.starts_at < day_end,
                    Booking.id != exclude_booking_id if exclude_booking_id else True,
                )
            )
        )
        current_count = count_result.scalar() or 0
        remaining = event_type.max_bookings_per_day - current_count
        if remaining <= 0:
            if debug:
                debug_info["max_bookings_reached"] = True
                return debug_info
            return []

    if debug:
        debug_info["slots"] = available
        return debug_info

    return available


async def freshen_host_calendars(host: User) -> None:
    """Re-sync the host's stale calendars right before a booking decision."""
    from app.tasks import freshen_user_calendars

    await freshen_user_calendars(host.id, budget_seconds=8)


async def is_bookable(
    db: AsyncSession,
    host: User,
    event_type: EventType,
    starts_at: datetime,
    *,
    exclude_booking_id: uuid.UUID | None = None,
    freshen: bool = True,
) -> bool:
    """Whether starts_at is one of the slots the booking page would offer.

    The public booking endpoints call this so a request made outside the page
    still honours availability rules, synced calendar events, buffers, the
    booking horizon and the daily cap.

    freshen=False skips the calendar re-sync, for callers that already ran it
    before taking the host's booking lock (a sync must not run under the lock)."""
    host_tz = host_zone(host)
    if freshen:
        await freshen_host_calendars(host)
    slots = await get_available_slots(
        db,
        host,
        event_type,
        starts_at.astimezone(host_tz).date(),
        exclude_booking_id=exclude_booking_id,
    )
    return any(datetime.fromisoformat(slot) == starts_at for slot in slots)
