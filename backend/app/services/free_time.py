"""Open windows across the coming days, for sharing availability by hand.

Uses the same inputs as the booking page (working hours, synced calendar
events, confirmed bookings) but returns merged free stretches instead of
fixed-length slots.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.availability_rule import AvailabilityRule
from app.models.booking import Booking
from app.models.cached_event import CachedEvent
from app.models.event_type import EventType
from app.models.user import User
from app.services.availability import BOOKING_HORIZON_DAYS, host_zone

# Windows are snapped inward to this grid so nobody is offered 10:07.
SNAP_MINUTES = 15

Interval = tuple[datetime, datetime]


def _snap_up(t: datetime) -> datetime:
    extra = (t.minute % SNAP_MINUTES) * 60 + t.second + t.microsecond / 1e6
    return t if extra == 0 else t + timedelta(seconds=SNAP_MINUTES * 60 - extra)


def _snap_down(t: datetime) -> datetime:
    return t.replace(second=0, microsecond=0) - timedelta(minutes=t.minute % SNAP_MINUTES)


def subtract(window: Interval, busy: list[Interval]) -> list[Interval]:
    """Parts of ``window`` not covered by any busy interval."""
    free = [window]
    for b_start, b_end in sorted(busy):
        nxt: list[Interval] = []
        for f_start, f_end in free:
            if b_end <= f_start or b_start >= f_end:
                nxt.append((f_start, f_end))
                continue
            if b_start > f_start:
                nxt.append((f_start, b_start))
            if b_end < f_end:
                nxt.append((b_end, f_end))
        free = nxt
    return free


async def free_windows(
    db: AsyncSession,
    host: User,
    days: int = 7,
    min_minutes: int = 30,
    buffer_minutes: int = 0,
    now: datetime | None = None,
    default_hours: bool = False,
) -> list[dict]:
    """Per host-local day: the open windows (UTC) inside working hours.

    default_hours treats a host who never set working hours as working
    9 to 5 on weekdays, instead of never free."""
    now = now or datetime.now(timezone.utc)
    days = max(1, min(days, BOOKING_HORIZON_DAYS))
    tz = host_zone(host)
    today = now.astimezone(tz).date()
    span_start = datetime.combine(today, datetime.min.time(), tzinfo=tz).astimezone(timezone.utc)
    span_end = datetime.combine(today + timedelta(days=days + 1), datetime.min.time(), tzinfo=tz).astimezone(timezone.utc)

    rules = {
        r.day_of_week: r
        for r in (
            await db.execute(
                select(AvailabilityRule).where(
                    AvailabilityRule.user_id == host.id, AvailabilityRule.is_active.is_(True)
                )
            )
        ).scalars()
    }
    if not rules and default_hours:
        rules = {d: SimpleNamespace(start_time=time(9), end_time=time(17)) for d in range(5)}
    events = (
        await db.execute(
            select(CachedEvent.starts_at, CachedEvent.ends_at).where(
                and_(CachedEvent.user_id == host.id, CachedEvent.starts_at < span_end, CachedEvent.ends_at > span_start)
            )
        )
    ).all()
    bookings = (
        await db.execute(
            select(Booking.starts_at, Booking.ends_at, EventType.buffer_minutes)
            .join(EventType, EventType.id == Booking.event_type_id)
            .where(
                and_(
                    Booking.host_user_id == host.id,
                    Booking.status == "confirmed",
                    Booking.starts_at < span_end,
                    Booking.ends_at > span_start,
                )
            )
        )
    ).all()

    pad = timedelta(minutes=buffer_minutes)
    busy: list[Interval] = [(s - pad, e + pad) for s, e in events]
    busy += [
        (s - max(pad, timedelta(minutes=b or 0)), e + max(pad, timedelta(minutes=b or 0)))
        for s, e, b in bookings
    ]

    out: list[dict] = []
    for offset in range(days):
        day: date = today + timedelta(days=offset)
        rule = rules.get(day.weekday())
        windows: list[dict] = []
        if rule is not None:
            start = datetime.combine(day, rule.start_time, tzinfo=tz).astimezone(timezone.utc)
            end = datetime.combine(day, rule.end_time, tzinfo=tz).astimezone(timezone.utc)
            start = max(start, now)
            if start < end:
                for f_start, f_end in subtract((start, end), busy):
                    f_start, f_end = _snap_up(f_start), _snap_down(f_end)
                    if f_end - f_start >= timedelta(minutes=min_minutes):
                        windows.append({"start": f_start.isoformat(), "end": f_end.isoformat()})
        out.append({
            "date": day.isoformat(),
            "working": rule is not None,
            "work_start": rule.start_time.strftime("%H:%M") if rule else None,
            "work_end": rule.end_time.strftime("%H:%M") if rule else None,
            "windows": windows,
        })
    return out
