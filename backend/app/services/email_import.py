"""Email a schedule in: read events out of an emailed schedule and add them.

Each account has a private address, schedule-<token>@<INBOUND_DOMAIN>. Resend
receives the mail and posts an ``email.received`` webhook; we fetch the body
and attachments, read events out of them (.ics files directly, anything else
with Claude), store them under a "From email" calendar so they block booking
times, and reply to the sender with what was added and an undo link.
"""
from __future__ import annotations

import base64
import logging
import re
import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone
from email.utils import parseaddr
from typing import Any, Optional
from zoneinfo import ZoneInfo

import anthropic
import httpx
from icalendar import Calendar
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.models.email_import import EmailImport
from app.models.user import User
from app.services.calendar_sync import _expand_ics, host_zone

logger = logging.getLogger(__name__)

ADDRESS_PREFIX = "schedule-"
SOURCE_TYPE = "email"
SOURCE_NAME = "From email"
MODEL = "claude-haiku-5-5"
MAX_IMPORTS_PER_DAY = 20
MAX_EMAIL_BYTES = 15 * 1024 * 1024
MAX_EVENTS = 300
# How far ahead .ics files are expanded (a season, or a school year).
ICS_DAYS_AHEAD = 400
IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
RESEND_API = "https://api.resend.com"


# ---------------------------------------------------------------------------
# Addresses
# ---------------------------------------------------------------------------

def new_token() -> str:
    return secrets.token_hex(10)  # 20 lowercase hex chars; local parts are case-insensitive


def ensure_inbound_token(user: User) -> str:
    if not user.inbound_token:
        user.inbound_token = new_token()
    return user.inbound_token


def address_for(user: User) -> str:
    return f"{ADDRESS_PREFIX}{ensure_inbound_token(user)}@{settings.INBOUND_DOMAIN}"


def token_from_recipients(recipients: list[str]) -> str | None:
    pattern = re.compile(
        rf"^{re.escape(ADDRESS_PREFIX)}([0-9a-f]{{16,32}})@{re.escape(settings.INBOUND_DOMAIN)}$", re.I
    )
    for raw in recipients or []:
        match = pattern.match(parseaddr(raw)[1].strip())
        if match:
            return match.group(1).lower()
    return None


# ---------------------------------------------------------------------------
# Reading the email
# ---------------------------------------------------------------------------

class Attachment(BaseModel):
    filename: str = ""
    content_type: str = ""
    data: bytes = b""


async def fetch_email(email_id: str) -> tuple[dict, list[Attachment]]:
    """The received email's details and attachment bytes, from Resend."""
    headers = {"Authorization": f"Bearer {settings.RESEND_INBOUND_API_KEY}"}
    async with httpx.AsyncClient(timeout=20) as client:
        detail = (await client.get(f"{RESEND_API}/emails/receiving/{email_id}", headers=headers)).raise_for_status().json()
        listing = (
            await client.get(f"{RESEND_API}/emails/receiving/{email_id}/attachments", headers=headers)
        ).raise_for_status().json()
        attachments: list[Attachment] = []
        total = 0
        for item in listing.get("data", []):
            size = int(item.get("size") or 0)
            total += size
            if total > MAX_EMAIL_BYTES:
                raise ImportRejected("That email is over 15 MB. Send the schedule on its own, or a smaller file.")
            if item.get("content"):
                data = base64.b64decode(item["content"])
            elif item.get("download_url"):
                data = (await client.get(item["download_url"])).raise_for_status().content
            else:
                continue
            attachments.append(
                Attachment(
                    filename=item.get("filename") or "",
                    content_type=(item.get("content_type") or "").split(";")[0].strip().lower(),
                    data=data,
                )
            )
    return detail, attachments


def _is_ics(a: Attachment) -> bool:
    return a.content_type in ("text/calendar", "application/ics") or a.filename.lower().endswith(".ics")


def _is_pdf(a: Attachment) -> bool:
    return a.content_type == "application/pdf" or a.filename.lower().endswith(".pdf")


def _image_type(a: Attachment) -> str | None:
    if a.content_type in IMAGE_TYPES:
        return a.content_type
    ext = a.filename.lower().rsplit(".", 1)[-1]
    return {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}.get(ext)


def rows_from_ics(data: bytes, tz: ZoneInfo, now: datetime) -> list[dict]:
    cal = Calendar.from_ical(data)
    return _expand_ics(cal, tz, now - timedelta(days=1), now + timedelta(days=ICS_DAYS_AHEAD))


# ---------------------------------------------------------------------------
# Reading schedules with Claude
# ---------------------------------------------------------------------------

class ExtractedEvent(BaseModel):
    title: str = Field(description="Short event name, e.g. 'U10 soccer practice' or 'Band concert'")
    date: str = Field(description="Calendar date, YYYY-MM-DD")
    start_time: Optional[str] = Field(None, description="Start, 24-hour HH:MM; null if all day or unknown")
    end_time: Optional[str] = Field(None, description="End, 24-hour HH:MM; null if not stated")
    all_day: bool = Field(description="True when the event has no start time")
    location: Optional[str] = None
    timezone: Optional[str] = Field(None, description="IANA zone if the schedule states one, else null")


class Extraction(BaseModel):
    schedule_name: Optional[str] = Field(None, description="What the schedule is for, e.g. 'Spring soccer'")
    events: list[ExtractedEvent]


SYSTEM_PROMPT = """You read schedules that people forward by email (sports seasons, \
band and school calendars, practice plans, game lists) and list every event in them.

- List each occurrence as its own event. Expand recurring patterns ("every Tuesday \
5-6pm through May 20") into one event per date, using today's date and the year \
context in the email to place dates in the right year.
- Use the schedule's own times. When only a start time is given, leave end_time null.
- Skip anything that is not an event someone attends (deadlines with no time are \
fine as all-day events; skip signatures, ads and unsubscribe text).
- If the email contains no schedule, return an empty events list."""


async def extract_events(subject: str, body: str, attachments: list[Attachment], tz_name: str, today: date) -> Extraction:
    content: list[dict[str, Any]] = []
    for a in attachments:
        if _is_pdf(a):
            content.append({
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": base64.b64encode(a.data).decode()},
            })
        elif media := _image_type(a):
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media, "data": base64.b64encode(a.data).decode()},
            })
    content.append({
        "type": "text",
        "text": (
            f"Today is {today.isoformat()} ({today.strftime('%A')}). The recipient's time zone is {tz_name}.\n"
            f"Email subject: {subject or '(none)'}\n\nEmail body:\n{body or '(empty)'}"
        ),
    })
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        output_config={"effort": "low"},
        output_format=Extraction,
    )
    if response.stop_reason in ("refusal", "max_tokens") or response.parsed_output is None:
        logger.warning("Schedule extraction stopped: %s", response.stop_reason)
        return Extraction(events=[])
    return response.parsed_output


def _clock(value: str | None) -> time | None:
    if not value:
        return None
    try:
        h, m = value.strip().split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError):
        return None


def rows_from_extraction(ex: Extraction, default_tz: ZoneInfo) -> list[dict]:
    rows: list[dict] = []
    for ev in ex.events:
        try:
            day = date.fromisoformat(ev.date)
        except ValueError:
            continue
        tz = default_tz
        if ev.timezone:
            try:
                tz = ZoneInfo(ev.timezone)
            except Exception:
                pass
        start = _clock(ev.start_time)
        title = (ev.title or "Event").strip()
        if ev.location and ev.location.strip() and ev.location.strip().lower() not in title.lower():
            title = f"{title} @ {ev.location.strip()}"
        title = title[:500]
        if ev.all_day or start is None:
            starts_at = datetime.combine(day, time.min, tzinfo=tz)
            ends_at = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
            all_day = True
        else:
            starts_at = datetime.combine(day, start, tzinfo=tz)
            end = _clock(ev.end_time)
            ends_at = datetime.combine(day, end, tzinfo=tz) if end else starts_at + timedelta(hours=1)
            if ends_at <= starts_at:
                ends_at = starts_at + timedelta(hours=1)
            all_day = False
        rows.append(dict(
            title=title,
            starts_at=starts_at.astimezone(timezone.utc),
            ends_at=ends_at.astimezone(timezone.utc),
            is_all_day=all_day,
            external_id=None,
        ))
    return rows


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------

class ImportRejected(Exception):
    """The email can't be imported; the message is sent back to the sender."""


class _Skip(Exception):
    """Fetching already failed; keep the status it set."""


async def _email_source(db: AsyncSession, user: User) -> CalendarSource:
    source = (
        await db.execute(
            select(CalendarSource).where(CalendarSource.user_id == user.id, CalendarSource.type == SOURCE_TYPE)
        )
    ).scalars().first()
    if source is None:
        source = CalendarSource(user_id=user.id, type=SOURCE_TYPE, name=SOURCE_NAME, is_active=True)
        db.add(source)
        await db.flush()
    return source


def _dedupe(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out = []
    for r in rows:
        key = (r["title"], r["starts_at"], r["ends_at"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


async def process_inbound(payload: dict, now: datetime | None = None) -> EmailImport | None:
    """Handle one ``email.received`` webhook. Returns the import, or None if ignored."""
    now = now or datetime.now(timezone.utc)
    data = payload.get("data") or {}
    email_id = data.get("email_id") or data.get("id")
    # cc'd or bcc'd counts too (cc TimeIQ on a thread); received_for names the
    # exact address Resend accepted the mail for.
    # When one email reaches several Resend-hosted addresses, each copy names
    # its own in received_for; only the copy for a TimeIQ address counts.
    token = token_from_recipients(
        data.get("received_for") or [*(data.get("to") or []), *(data.get("cc") or []), *(data.get("bcc") or [])]
    )
    sender = parseaddr(data.get("from") or "")[1].strip().lower()
    if not email_id or not token:
        return None
    if sender.endswith("@" + settings.INBOUND_DOMAIN.lower()):
        return None  # never answer our own mail (no reply loops)

    async with async_session() as db:
        user = (await db.execute(select(User).where(User.inbound_token == token))).scalar_one_or_none()
        if user is None:
            logger.info("Inbound email for an unknown address token")
            return None
        record = EmailImport(
            user_id=user.id,
            resend_email_id=email_id,
            sender=sender or None,
            subject=(data.get("subject") or "")[:500] or None,
            undo_token=secrets.token_urlsafe(32),
        )
        db.add(record)
        try:
            await db.commit()
        except IntegrityError:
            return None  # a retried webhook: already handled
        user_id = user.id

    rows: list[dict] = []
    schedule_name: str | None = None
    status, error = "imported", None
    detail: dict | None = None
    attachments: list[Attachment] = []
    try:
        detail, attachments = await fetch_email(email_id)
        # A thread about meeting up (cc TimeIQ), or a reply on one, goes to the
        # meeting agent; everything else is a schedule to import.
        from app.services import meeting_agent

        try:
            routed = await meeting_agent.handle(user_id, detail, now)
        except Exception:
            logger.exception("Meeting agent failed on %s", email_id)
            routed = "meeting_error"
        if routed is not None:
            async with async_session() as db:
                record = (await db.execute(select(EmailImport).where(EmailImport.resend_email_id == email_id))).scalar_one()
                record.status = routed
                await db.commit()
                await db.refresh(record)
            return record
    except ImportRejected as exc:
        detail = None
        status, error = "rejected", str(exc)
    except Exception as exc:
        logger.exception("Fetching inbound email %s failed", email_id)
        detail = None
        status, error = "failed", f"{type(exc).__name__}"

    try:
        if detail is None:
            raise _Skip()
        async with async_session() as db:
            recent = (
                await db.execute(
                    select(func.count()).select_from(EmailImport).where(
                        EmailImport.user_id == user_id,
                        EmailImport.created_at > now - timedelta(days=1),
                        EmailImport.status.notin_(("rejected", "ignored", "meeting", "meeting_reply", "meeting_booked", "meeting_error")),
                    )
                )
            ).scalar_one()
        if recent > MAX_IMPORTS_PER_DAY:
            raise ImportRejected(f"TimeIQ imports up to {MAX_IMPORTS_PER_DAY} schedules a day. Try again tomorrow.")
        async with async_session() as db:
            user = await db.get(User, user_id)
            tz = host_zone(user.timezone)
        for a in attachments:
            if _is_ics(a):
                try:
                    rows += rows_from_ics(a.data, tz, now)
                except Exception as exc:
                    logger.info("Skipping unreadable .ics attachment: %s", exc)
        readable = [a for a in attachments if _is_pdf(a) or _image_type(a)]
        body = (detail.get("text") or "").strip()
        if readable or (body and not rows):
            ex = await extract_events(detail.get("subject") or "", body, readable, str(tz), now.astimezone(tz).date())
            schedule_name = ex.schedule_name
            rows += rows_from_extraction(ex, tz)
        rows = _dedupe(rows)
        if len(rows) > MAX_EVENTS:
            raise ImportRejected(f"That schedule has {len(rows)} events; TimeIQ imports up to {MAX_EVENTS} at a time.")
        if not rows:
            status = "empty"
    except _Skip:
        rows = []
    except ImportRejected as exc:
        status, error, rows = "rejected", str(exc), []
    except Exception as exc:
        logger.exception("Schedule import %s failed", email_id)
        status, error, rows = "failed", f"{type(exc).__name__}", []

    async with async_session() as db:
        record = (await db.execute(select(EmailImport).where(EmailImport.resend_email_id == email_id))).scalar_one()
        user = await db.get(User, user_id)
        if rows:
            source = await _email_source(db, user)
            for row in rows:
                db.add(CachedEvent(
                    id=uuid.uuid4(), calendar_source_id=source.id, user_id=user.id, email_import_id=record.id, **row
                ))
            source.last_synced_at = now
        record.status = status
        record.error = error
        record.event_count = len(rows)
        await db.commit()
        await db.refresh(record)

    from app.services.email import send_schedule_import_reply

    recipients = {r for r in (sender, (user.email or "").lower()) if r}
    send_schedule_import_reply(user, record, rows, schedule_name, sorted(recipients))
    return record


async def undo(db: AsyncSession, record: EmailImport, now: datetime | None = None) -> int:
    """Remove exactly the events an import added. Returns how many."""
    if record.status != "imported":
        return 0
    result = await db.execute(delete(CachedEvent).where(CachedEvent.email_import_id == record.id))
    record.status = "undone"
    record.undone_at = now or datetime.now(timezone.utc)
    await db.flush()
    return result.rowcount or 0
