"""A local Monday morning summary, built from saved calendar and billing data."""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import uuid
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from html import escape
from time import monotonic

from sqlalchemy import func, or_, select

from app.config import settings
from app.database import async_session
from app.models.booking import Booking
from app.models.client import Client
from app.models.event_type import EventType
from app.models.group_meeting import GroupMeeting, GroupMeetingParticipant
from app.models.invoice import Invoice
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.services import email as mail
from app.services import email_templates as t
from app.services.availability import host_zone
from app.services.email_import import _entitled
from app.services.free_time import free_windows

# Stop starting new sends after this many seconds of a cron run (Vercel stops
# the function at 60).
CRON_BUDGET_SECONDS = 45

logger = logging.getLogger(__name__)
TOKEN_LIFETIME = timedelta(days=180)


def week_bounds(user, now):
    tz = host_zone(user)
    today = now.astimezone(tz).date()
    monday = today - timedelta(days=today.weekday())
    return (
        datetime.combine(monday, time.min, tzinfo=tz).astimezone(timezone.utc),
        datetime.combine(monday + timedelta(days=7), time.min, tzinfo=tz).astimezone(timezone.utc),
    )


def should_send(user, now) -> bool:
    local = now.astimezone(host_zone(user))
    start, _ = week_bounds(user, now)
    sent = user.weekly_summary_sent_at
    return bool(
        # From 7 AM on the owner's Monday: a run that missed 7 (a timeout,
        # a skipped cron) still sends it later that day.
        user.weekly_summary_enabled and _entitled(user) and local.weekday() == 0 and local.hour >= 7
        and (sent is None or sent < start)
    )


def _secret() -> bytes:
    secret = settings.WEEKLY_SUMMARY_SECRET or settings.CRON_SECRET
    if not secret.strip():
        raise ValueError("Configure WEEKLY_SUMMARY_SECRET or CRON_SECRET to sign summary unsubscribe links")
    return secret.encode()


def _signature(user, payload):
    return hmac.new(_secret(), f"weekly-summary:{payload}:{user.email.lower()}".encode(), hashlib.sha256).hexdigest()


def unsubscribe_token(user, now) -> str:
    payload = f"{user.id.hex}.{int((now + TOKEN_LIFETIME).timestamp())}"
    return f"{payload}.{_signature(user, payload)}"


def token_user_id(token: str, now) -> uuid.UUID | None:
    try:
        uid, expires, signature = token.split(".")
        if not re.fullmatch(r"[0-9a-f]{64}", signature) or int(expires) <= now.timestamp():
            return None
        return uuid.UUID(hex=uid)
    except (ValueError, AttributeError):
        return None


def valid_token(user, token, now) -> bool:
    if token_user_id(token, now) != user.id:
        return False
    payload, signature = token.rsplit(".", 1)
    try:
        return hmac.compare_digest(_signature(user, payload), signature)
    except ValueError:
        return False


async def build_content(db, user, now) -> dict:
    start, end = week_bounds(user, now)
    tz = host_zone(user)
    bookings = (await db.execute(
        select(Booking, EventType.name).join(EventType, EventType.id == Booking.event_type_id).where(
            Booking.host_user_id == user.id, Booking.status == "confirmed",
            Booking.starts_at >= start, Booking.starts_at < end,
        ).order_by(Booking.starts_at)
    )).all()
    participant = select(GroupMeetingParticipant.meeting_id).where(or_(
        GroupMeetingParticipant.user_id == user.id, func.lower(GroupMeetingParticipant.email) == user.email.lower(),
    ))
    meetings = (await db.execute(select(GroupMeeting).where(
        or_(GroupMeeting.organizer_id == user.id, GroupMeeting.id.in_(participant)),
        GroupMeeting.status == "booked", GroupMeeting.starts_at >= start, GroupMeeting.starts_at < end,
    ).order_by(GroupMeeting.starts_at))).scalars().all()
    days = {}
    for booking, title in bookings:
        local = booking.starts_at.astimezone(tz)
        days.setdefault(local.date(), []).append((booking.starts_at, f"{title} with {booking.visitor_name}"))
    for meeting in meetings:
        local = meeting.starts_at.astimezone(tz)
        days.setdefault(local.date(), []).append((meeting.starts_at, meeting.title))
    windows = await free_windows(db, user, days=7, min_minutes=60, now=now)
    highlights = [
        (datetime.fromisoformat(w["start"]), datetime.fromisoformat(w["end"]))
        for day in windows for w in day["windows"]
    ]
    highlights.sort(key=lambda w: (-(w[1] - w[0]).total_seconds(), w[0]))
    today = now.astimezone(tz).date()
    entries = (await db.execute(
        select(TimeEntry.hours, Client.hourly_rate, Client.currency)
        .join(Client, Client.id == TimeEntry.client_id).where(
            TimeEntry.user_id == user.id, Client.user_id == user.id,
            TimeEntry.invoice_id.is_(None), TimeEntry.entry_date <= today,
        )
    )).all()
    tracked = await db.scalar(select(TimeEntry.id).where(TimeEntry.user_id == user.id).limit(1))
    hours, amounts = Decimal("0"), {}
    for h, rate, currency in entries:
        hours += h
        amounts[currency] = amounts.get(currency, Decimal("0")) + h * rate
    overdue = await db.scalar(select(func.count()).select_from(Invoice).where(
        Invoice.user_id == user.id, Invoice.status == "sent", Invoice.due_date < today,
    ))
    return {"start": start, "days": days, "highlights": highlights[:3], "tracking": tracked is not None,
            "hours": hours, "amounts": amounts, "overdue": overdue or 0}


def render_content(user, content, unsubscribe_url) -> str:
    def heading(text):
        return f'<h2 style="font-size:18px;margin:24px 0 12px;">{escape(text)}</h2>'

    tz = host_zone(user)
    body = t.h1("Your week") + t.p(f"Week of {content['start'].astimezone(tz).strftime('%B %-d')}", muted=True)
    if content["days"]:
        for day, events in sorted(content["days"].items()):
            body += heading(day.strftime("%A, %B %-d"))
            body += t.details([(start.astimezone(tz).strftime("%-I:%M %p %Z"), title) for start, title in sorted(events)])
    else:
        body += t.p("You have no bookings or group meetings scheduled this week.")
    body += heading("Open time")
    if content["highlights"]:
        for start, end in content["highlights"]:
            local = start.astimezone(tz)
            body += t.p(f"{local.strftime('%A, %-I:%M %p')} to {end.astimezone(tz).strftime('%-I:%M %p %Z')} "
                        f"({(end - start).total_seconds() / 3600:g} hours)")
    else:
        body += t.p("There are no open blocks of an hour or more in your saved availability this week.")
    if content["tracking"]:
        body += heading("Unbilled time") + t.p(f"{content['hours']:g} hours")
        body += t.p(", ".join(f"{currency} {amount:,.2f}" for currency, amount in sorted(content["amounts"].items())) or "No unbilled amount")
    body += heading("Invoices") + t.p(f"Overdue invoices: {content['overdue']}")
    body += t.buttons(t.button("Open TimeIQ", f"{settings.FRONTEND_URL.rstrip('/')}/bookings"))
    body += t.p("Open time uses your saved availability and latest calendar sync.", muted=True)
    body += f'<p style="font-size:12px;"><a href="{escape(unsubscribe_url, quote=True)}">Unsubscribe from Your week</a></p>'
    return t.layout("reminder", "Your bookings, open time and billing for the week.", body)


async def send_for_user(db, user, now) -> None:
    content = await build_content(db, user, now)
    token = unsubscribe_token(user, now)
    url = f"{settings.BACKEND_URL.rstrip('/')}/api/weekly-summary/unsubscribe?token={token}"
    mail._init_resend()
    # Provider idempotency also covers a crash after send and before DB commit.
    mail.resend.Emails.send(mail.with_text({
        "from": mail.FROM_EMAIL, "to": [user.email], "subject": "Your week",
        "html": render_content(user, content, url),
        "headers": {"List-Unsubscribe": f"<{url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
    }), {"idempotency_key": f"weekly-summary-{user.id}-{content['start'].date().isoformat()}"})
    user.weekly_summary_sent_at = now
    await db.commit()


async def send_weekly_summaries(now=None) -> dict:
    now = now or datetime.now(timezone.utc)
    result = {"sent": 0, "failed": 0}
    async with async_session() as db:
        users = (await db.execute(select(User).where(User.weekly_summary_enabled.is_(True)))).scalars().all()
        ids = [user.id for user in users if should_send(user, now)]
    deadline = monotonic() + CRON_BUDGET_SECONDS
    for uid in ids:
        if monotonic() > deadline:
            # Under the 60 s function limit; the next hourly run picks up the rest.
            result["deferred"] = len(ids) - result["sent"] - result["failed"]
            break
        try:
            async with async_session() as db:
                user = (await db.execute(select(User).where(User.id == uid).with_for_update(skip_locked=True))).scalar_one_or_none()
                if user is not None and should_send(user, now):
                    await send_for_user(db, user, now)
                    result["sent"] += 1
        except Exception:
            # Provider exception text may carry request details; log only the user id.
            logger.error("Weekly summary failed for user %s", uid)
            result["failed"] += 1
    return result
