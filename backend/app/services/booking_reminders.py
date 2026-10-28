from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select

from app.database import async_session
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.services.email import send_booking_reminder

logger = logging.getLogger(__name__)
REMINDER_OPTIONS = (15, 60, 1440)


def due_reminders(booking: Booking, event_type: EventType, now: datetime) -> list[tuple[int, str]]:
    """A reminder stays due until sent or the meeting starts, so delayed runs
    and delivery failures can retry. Creation after its due instant skips it."""
    if booking.status != "confirmed" or booking.starts_at <= now:
        return []
    sent = set(booking.reminder_sent or [])
    recipients = ("guest", "host") if event_type.remind_host else ("guest",)
    due = []
    for minutes in sorted(set(event_type.reminder_minutes or []) & set(REMINDER_OPTIONS)):
        due_at = booking.starts_at - timedelta(minutes=minutes)
        if booking.created_at <= due_at <= now:
            due.extend((minutes, recipient) for recipient in recipients if f"{minutes}:{recipient}" not in sent)
    return due


def _due_query(now: datetime):
    windows = []
    for minutes in REMINDER_OPTIONS:
        due_at = Booking.starts_at - timedelta(minutes=minutes)
        windows.append(and_(
            EventType.reminder_minutes.contains([minutes]),
            Booking.created_at <= due_at,
            due_at <= now,
            or_(
                ~Booking.reminder_sent.contains([f"{minutes}:guest"]),
                and_(EventType.remind_host.is_(True), ~Booking.reminder_sent.contains([f"{minutes}:host"])),
            ),
        ))
    return (
        select(Booking, EventType, User)
        .join(EventType, EventType.id == Booking.event_type_id)
        .join(User, User.id == Booking.host_user_id)
        .where(Booking.status == "confirmed", Booking.starts_at > now,
               Booking.starts_at <= now + timedelta(minutes=max(REMINDER_OPTIONS)), or_(*windows))
    )


async def send_due_booking_reminders() -> dict[str, int]:
    results = {"sent": 0, "failed": 0}
    attempted = []
    # Leave room for the provider's 30-second timeout and the final commit
    # within the cron's 60-second function limit.
    deadline = time.monotonic() + 25
    # One transaction per booking. The same row lock is used by cancellation
    # and rescheduling; concurrent cron workers skip it until delivery commits.
    while time.monotonic() < deadline:
        async with async_session() as db:
            now = datetime.now(timezone.utc)
            query = _due_query(now).where(Booking.id.not_in(attempted)).order_by(Booking.starts_at, Booking.id).limit(1)
            row = (await db.execute(query.with_for_update(of=Booking, skip_locked=True))).first()
            if row is None:
                break
            booking, event_type, host = row
            attempted.append(booking.id)
            for minutes, recipient in due_reminders(booking, event_type, datetime.now(timezone.utc)):
                if time.monotonic() >= deadline:
                    break
                try:
                    await send_booking_reminder(booking, event_type, host, minutes, recipient)
                except Exception:
                    # Provider errors can contain addresses or credentials.
                    logger.warning("Booking reminder delivery failed for booking %s", booking.id)
                    results["failed"] += 1
                    continue
                booking.reminder_sent = [*(booking.reminder_sent or []), f"{minutes}:{recipient}"]
                results["sent"] += 1
            await db.commit()
    return results
