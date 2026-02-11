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


async def get_available_slots(
    db: AsyncSession,
    host: User,
    event_type: EventType,
    target_date: date,
    *,
    debug: bool = False,
) -> list[str] | dict:
    """
    Compute available time slots for a given host, event type, and date.

    Returns a list of ISO 8601 datetime strings representing available slot start times.
    If debug=True, returns a dict with full diagnostic information.
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

    # Use the host's timezone
    try:
        host_tz = zoneinfo.ZoneInfo(host.timezone)
    except Exception:
        host_tz = zoneinfo.ZoneInfo("America/New_York")

    # 2. Generate candidate slots
    rule_start = datetime.combine(target_date, rule.start_time, tzinfo=host_tz)
    rule_end = datetime.combine(target_date, rule.end_time, tzinfo=host_tz)
    duration = timedelta(minutes=event_type.duration_minutes)
    buffer = timedelta(minutes=event_type.buffer_minutes)

    if debug:
        debug_info["rule_start"] = rule_start.isoformat()
        debug_info["rule_end"] = rule_end.isoformat()
        debug_info["duration_minutes"] = event_type.duration_minutes
        debug_info["buffer_minutes"] = event_type.buffer_minutes
        debug_info["host_timezone"] = str(host_tz)

    candidates: list[datetime] = []
    current = rule_start
    while current + duration <= rule_end:
        candidates.append(current)
        current += duration

    if debug:
        debug_info["total_candidates"] = len(candidates)
        if candidates:
            debug_info["first_candidate"] = candidates[0].isoformat()
            debug_info["last_candidate"] = candidates[-1].isoformat()

    if not candidates:
        if debug:
            return debug_info
        return []

    # 3. Get the full window in UTC for querying
    window_start_utc = rule_start.astimezone(timezone.utc)
    window_end_utc = rule_end.astimezone(timezone.utc)

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

    # 5. Get existing bookings that overlap this window (only confirmed)
    bk_result = await db.execute(
        select(Booking).where(
            and_(
                Booking.host_user_id == host.id,
                Booking.status == "confirmed",
                Booking.starts_at < window_end_utc,
                Booking.ends_at > window_start_utc,
            )
        )
    )
    existing_bookings = bk_result.scalars().all()

    # 6. Build list of busy intervals (as UTC datetime tuples)
    busy_intervals: list[tuple[datetime, datetime]] = []
    for ev in cached_events:
        busy_intervals.append((ev.starts_at, ev.ends_at))
    for bk in existing_bookings:
        # Apply buffer around existing bookings
        busy_intervals.append(
            (bk.starts_at - buffer, bk.ends_at + buffer)
        )

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

    for slot_start in candidates:
        slot_start_utc = slot_start.astimezone(timezone.utc)
        slot_end_utc = (slot_start + duration).astimezone(timezone.utc)

        # Don't allow booking in the past
        if slot_start_utc <= now_utc:
            if debug:
                rejected.append({
                    "slot": slot_start.isoformat(),
                    "reason": "in_the_past",
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
        # Count existing confirmed bookings for this event type on this date
        day_start = datetime.combine(target_date, time.min, tzinfo=host_tz).astimezone(
            timezone.utc
        )
        day_end = datetime.combine(target_date, time.max, tzinfo=host_tz).astimezone(
            timezone.utc
        )
        count_result = await db.execute(
            select(func.count(Booking.id)).where(
                and_(
                    Booking.event_type_id == event_type.id,
                    Booking.host_user_id == host.id,
                    Booking.status == "confirmed",
                    Booking.starts_at >= day_start,
                    Booking.starts_at <= day_end,
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
        available = available[:remaining]

    if debug:
        debug_info["slots"] = available
        return debug_info

    return available
