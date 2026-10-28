"""Transactional email: booking confirmations and cancellations, invoices,
welcome, and overdue reminders. All messages share the layout in
email_templates so they look like one product."""
from __future__ import annotations

import asyncio
import base64
import logging
from datetime import date, datetime, timezone
from html import escape as html_escape
from zoneinfo import ZoneInfo

import resend

from app.services.invoicing import split_emails

from app.config import settings
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.services import email_templates as t
from app.services.ics_generator import generate_booking_ics, ical_uid_for

logger = logging.getLogger(__name__)

FROM_EMAIL = "TimeIQ <bookings@timeiq.app>"
MAKER_NAME = "Elon"
MAKER_ROLE = "Maker of TimeIQ"
MAKER_EMAIL = "simsketch@gmail.com"


def _init_resend() -> None:
    resend.api_key = settings.RESEND_API_KEY


def _site() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def _zone(tz_name: str | None) -> ZoneInfo:
    """A stored zone that no longer loads (legacy data) falls back to UTC rather
    than failing the email, and with it the request."""
    try:
        return ZoneInfo(tz_name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _format_datetime(dt, tz_name: str) -> str:
    local = dt.astimezone(_zone(tz_name))
    return local.strftime("%A, %B %d, %Y at %I:%M %p %Z")


def _format_time(dt, tz_name: str) -> str:
    local = dt.astimezone(_zone(tz_name))
    return local.strftime("%I:%M %p %Z")


def _when(starts_at: datetime, ends_at: datetime, tz_name: str) -> str:
    return f"{_format_datetime(starts_at, tz_name)} to {_format_time(ends_at, tz_name)}"


def _fmt_date(d: date) -> str:
    return d.strftime("%b %d, %Y")


def _send(payload: dict, what: str) -> None:
    """Send and log; booking/notification mail must never break the request."""
    try:
        resend.Emails.send(payload)
    except Exception as exc:
        logger.error("Failed to send %s: %s", what, exc)


def _location_row(event_type: EventType) -> tuple[str, str]:
    loc = event_type.location or ""
    if not loc:
        return ("Location", "")
    if loc.startswith(("http://", "https://")):
        return ("Location", f'<a href="{html_escape(loc, quote=True)}" style="color:{t.INDIGO};">{html_escape(loc)}</a>')
    return ("Location", html_escape(loc))


def _ics(booking: Booking, event_type: EventType, host: User, summary: str, method: str = "REQUEST") -> str:
    """The booking's invite. Its UID is shared across the reschedule chain and
    its SEQUENCE grows with each change, so calendars update or (CANCEL) remove
    the one event instead of keeping a stale copy."""
    return generate_booking_ics(
        booking_id=booking.id,
        summary=summary,
        description=(
            f"Booking with {host.name or host.email}\n"
            f"Event: {event_type.name}\n"
            f"Duration: {event_type.duration_minutes} minutes"
        ),
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        host_name=host.name,
        host_email=host.email,
        visitor_name=booking.visitor_name,
        visitor_email=booking.visitor_email,
        location=event_type.location,
        uid=ical_uid_for(booking),
        sequence=booking.ical_sequence or 0,
        method=method,
    )


def _invite(booking: Booking, event_type: EventType, host: User, summary: str, method: str = "REQUEST") -> dict:
    return {
        "filename": "cancel.ics" if method == "CANCEL" else "invite.ics",
        "content": _ics(booking, event_type, host, summary, method),
        "content_type": f"text/calendar; method={method}",
    }


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------


def render_booking_confirmation_visitor(booking: Booking, event_type: EventType, host: User) -> str:
    host_name = host.name or host.email
    tz = booking.timezone or "UTC"
    cancel_url, reschedule_url = booking_links(booking)
    body = (
        t.h1(f"You're booked with {host_name}.")
        + t.p("A calendar invite is attached. Open it to add this to your calendar.", muted=True)
        + t.details(
            [
                ("Event", html_escape(event_type.name)),
                ("When", html_escape(_when(booking.starts_at, booking.ends_at, tz))),
                ("Duration", f"{event_type.duration_minutes} minutes"),
                _location_row(event_type),
            ],
            rows_html=True,
        )
        + t.buttons(t.button("Reschedule", reschedule_url, secondary=True), t.button("Cancel booking", cancel_url, secondary=True))
        + t.p(f"Need to reach {host_name} directly? Reply to this email.", muted=True)
    )
    return t.layout("confirmed", f"Confirmed with {host_name}: {_format_datetime(booking.starts_at, tz)}", body)


def booking_links(booking: Booking) -> tuple[str, str]:
    base = f"{_site()}/bookings/{booking.id}"
    return (f"{base}/cancel?token={booking.cancel_token}", f"{base}/reschedule?token={booking.cancel_token}")


def render_booking_reminder(booking: Booking, event_type: EventType, host: User, recipient: str) -> str:
    is_host = recipient == "host"
    tz = host.timezone if is_host else booking.timezone
    other = booking.visitor_name if is_host else (host.name or host.email)
    cancel_url, reschedule_url = booking_links(booking)
    body = (
        t.h1(f"Your meeting with {other} is coming up.")
        + t.details([
            ("Event", html_escape(event_type.name)),
            ("When", html_escape(_when(booking.starts_at, booking.ends_at, tz or "UTC"))),
            _location_row(event_type),
        ], rows_html=True)
        + t.buttons(t.button("Reschedule", reschedule_url, secondary=True), t.button("Cancel booking", cancel_url, secondary=True))
    )
    return t.layout("reminder", f"Reminder: {event_type.name} with {other}", body)


async def send_booking_reminder(booking: Booking, event_type: EventType, host: User, minutes: int, recipient: str) -> None:
    """Let failures reach the cron so it only records successful deliveries.
    A stable provider key also covers a send followed by a failed DB commit."""
    _init_resend()
    is_host = recipient == "host"
    payload = {
        "from": FROM_EMAIL,
        "to": [host.email if is_host else booking.visitor_email],
        "reply_to": booking.visitor_email if is_host else host.email,
        "subject": f"Reminder: {event_type.name} with {booking.visitor_name if is_host else (host.name or host.email)}",
        "html": render_booking_reminder(booking, event_type, host, recipient),
    }
    await asyncio.to_thread(resend.Emails.send, payload, options={
        "idempotency_key": f"booking-reminder/{booking.id}/{minutes}/{recipient}",
    })


def render_booking_confirmation_host(booking: Booking, event_type: EventType, host: User) -> str:
    tz = host.timezone or "UTC"
    rows = [
        ("Guest", f"{html_escape(booking.visitor_name)}<br><span style=\"color:{t.MUTED};\">{html_escape(booking.visitor_email)}</span>"),
        ("When", html_escape(_when(booking.starts_at, booking.ends_at, tz))),
        ("Event", html_escape(event_type.name)),
        ("Phone", html_escape(booking.visitor_phone or "")),
        ("Company", html_escape(booking.visitor_company or "")),
        ("Link", f'<a href="{html_escape(booking.visitor_url, quote=True)}" style="color:{t.INDIGO};">{html_escape(booking.visitor_url)}</a>' if booking.visitor_url else ""),
        ("Notes", html_escape(booking.visitor_notes or "")),
    ]
    body = (
        t.h1(f"{booking.visitor_name} booked {event_type.name}.")
        + t.p("It's on your calendar; the invite is attached.", muted=True)
        + t.details(rows, rows_html=True)
        + t.buttons(t.button("View bookings", f"{_site()}/bookings"))
    )
    return t.layout("new-booking", f"{booking.visitor_name} booked {event_type.name}", body)


async def send_booking_confirmation(booking: Booking, event_type: EventType, host: User) -> None:
    """Confirmation to the visitor and a heads-up to the host, each in their own timezone."""
    _init_resend()
    host_name = host.name or host.email
    _send(
        {
            "from": FROM_EMAIL,
            "to": [booking.visitor_email],
            "reply_to": host.email,
            "subject": f"Confirmed: {event_type.name} with {host_name}",
            "html": render_booking_confirmation_visitor(booking, event_type, host),
            "attachments": [_invite(booking, event_type, host, f"{host_name} 1:1")],
        },
        "visitor confirmation",
    )
    _send(
        {
            "from": FROM_EMAIL,
            "to": [host.email],
            "reply_to": booking.visitor_email,
            "subject": f"New booking: {booking.visitor_name}, {event_type.name}",
            "html": render_booking_confirmation_host(booking, event_type, host),
            "attachments": [_invite(booking, event_type, host, f"{booking.visitor_name} 1:1")],
        },
        "host confirmation",
    )


def render_cancellation_visitor(booking: Booking, event_type: EventType, host: User) -> str:
    host_name = host.name or host.email
    tz = booking.timezone or "UTC"
    rebook_url = f"{_site()}/book/{host.username}/{event_type.slug}"
    body = (
        t.h1("This booking was cancelled.")
        + t.details(
            [
                ("Event", event_type.name),
                ("With", host_name),
                ("Was", _format_datetime(booking.starts_at, tz)),
            ]
        )
        + t.p(f"If you still want to meet, {host_name}'s calendar is open.", muted=True)
        + t.buttons(t.button("Book another time", rebook_url))
    )
    return t.layout("cancelled", f"Cancelled: {event_type.name} with {host_name}", body)


def render_cancellation_host(booking: Booking, event_type: EventType, host: User) -> str:
    tz = host.timezone or "UTC"
    body = (
        t.h1(f"{booking.visitor_name} cancelled.")
        + t.details(
            [
                ("Guest", f"{booking.visitor_name} ({booking.visitor_email})"),
                ("Event", event_type.name),
                ("Was", _format_datetime(booking.starts_at, tz)),
            ]
        )
        + t.p("The slot is open again on your booking page.", muted=True)
        + t.buttons(t.button("View bookings", f"{_site()}/bookings", secondary=True))
    )
    return t.layout("cancelled", f"{booking.visitor_name} cancelled {event_type.name}", body)


async def send_cancellation_notice(booking: Booking, event_type: EventType, host: User) -> None:
    """Both sides get a METHOD:CANCEL for the booking's invite, so it leaves
    their calendars. The caller bumps booking.ical_sequence first."""
    _init_resend()
    host_name = host.name or host.email
    _send(
        {
            "from": FROM_EMAIL,
            "to": [booking.visitor_email],
            "reply_to": host.email,
            "subject": f"Cancelled: {event_type.name} with {host_name}",
            "html": render_cancellation_visitor(booking, event_type, host),
            "attachments": [_invite(booking, event_type, host, f"{host_name} 1:1", "CANCEL")],
        },
        "visitor cancellation",
    )
    _send(
        {
            "from": FROM_EMAIL,
            "to": [host.email],
            "reply_to": booking.visitor_email,
            "subject": f"Cancelled: {booking.visitor_name}, {event_type.name}",
            "html": render_cancellation_host(booking, event_type, host),
            "attachments": [_invite(booking, event_type, host, f"{booking.visitor_name} 1:1", "CANCEL")],
        },
        "host cancellation",
    )


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


def render_invoice(
    invoice,
    sender: User,
    hosted_url: str,
    reminder_days: int | None = None,
    copy_sent_to: list[str] | None = None,
) -> str:
    from app.services.invoice_pdf import fmt_money

    sender_name = sender.name or sender.email
    greeting = invoice.client_contact_name or invoice.client_name
    amount = fmt_money(invoice.subtotal, invoice.currency)
    if copy_sent_to is not None:
        to = ", ".join(copy_sent_to) or "your client"
        sent = f" on {_fmt_date(invoice.sent_at)}" if getattr(invoice, "sent_at", None) else ""
        headline = f"Your copy of invoice {invoice.number}"
        lede = f"This is a copy of the invoice sent to {invoice.client_name} ({to}){sent}. The PDF they received is attached."
        hero = "invoice"
    elif reminder_days is None:
        headline = f"Invoice {invoice.number} from {sender_name}"
        lede = f"Hi {greeting}, here's the invoice for {_fmt_date(invoice.period_start)} to {_fmt_date(invoice.period_end)}. The PDF is attached, and the online copy is always current."
        hero = "invoice"
    else:
        headline = f"Invoice {invoice.number} is {reminder_days} day{'s' if reminder_days != 1 else ''} past due"
        lede = f"Hi {greeting}, a friendly nudge on invoice {invoice.number}. If it's already on its way, thank you, and feel free to ignore this."
        hero = "reminder"
    body = (
        t.h1(headline)
        + t.p(lede)
        + t.big_number(amount, f"Due {_fmt_date(invoice.due_date)}")
        + t.details(
            [
                ("Invoice", invoice.number),
                ("Period", f"{_fmt_date(invoice.period_start)} to {_fmt_date(invoice.period_end)}"),
                ("Issued", _fmt_date(invoice.issue_date)),
                ("Due", _fmt_date(invoice.due_date)),
            ]
        )
        + t.buttons(t.button("View invoice online", hosted_url))
        + (
            t.p("Questions? Just reply to this email.", muted=True)
            if copy_sent_to is None
            else ""
        )
        + t.signoff(sender_name, sender.email)
    )
    return t.layout(hero, f"{headline}: {amount} due {_fmt_date(invoice.due_date)}", body)


def send_invoice(
    invoice,
    pdf_bytes: bytes,
    sender: User,
    hosted_url: str,
    reminder_days: int | None = None,
    recipients: list[str] | None = None,
    copy_sender: bool = False,
) -> None:
    """Email an invoice PDF to the client, one message with every recipient on To
    so they can reply-all. Defaults to all of the invoice's billing addresses.
    copy_sender BCCs the sender, so their copy is exactly what the client got.
    Raises RuntimeError on failure so the API can report it, unlike booking mail
    which is best-effort."""
    _init_resend()
    sender_name = sender.name or sender.email
    subject = (
        f"Invoice {invoice.number} from {sender_name}"
        if reminder_days is None
        else f"Reminder: invoice {invoice.number} from {sender_name} is past due"
    )
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": recipients or split_emails(invoice.client_billing_email),
                **({"bcc": [sender.email]} if copy_sender else {}),
                "reply_to": sender.email,
                "subject": subject,
                "html": render_invoice(invoice, sender, hosted_url, reminder_days),
                "attachments": [
                    {
                        "filename": f"{invoice.number}.pdf",
                        "content": base64.b64encode(pdf_bytes).decode("ascii"),
                        "content_type": "application/pdf",
                    }
                ],
            }
        )
    except Exception as exc:
        logger.error("Failed to send invoice %s: %s", invoice.number, exc)
        raise RuntimeError("Failed to send invoice email") from exc


def send_invoice_copy(invoice, pdf_bytes: bytes, sender: User, hosted_url: str) -> None:
    """Email the sender their own copy of an invoice that has already gone out."""
    _init_resend()
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [sender.email],
                "subject": f"Your copy: invoice {invoice.number} to {invoice.client_name}",
                "html": render_invoice(
                    invoice,
                    sender,
                    hosted_url,
                    copy_sent_to=split_emails(invoice.client_billing_email),
                ),
                "attachments": [
                    {
                        "filename": f"{invoice.number}.pdf",
                        "content": base64.b64encode(pdf_bytes).decode("ascii"),
                        "content_type": "application/pdf",
                    }
                ],
            }
        )
    except Exception as exc:
        logger.error("Failed to send copy of invoice %s: %s", invoice.number, exc)
        raise RuntimeError("Failed to send your copy") from exc


def render_overdue_digest(user: User, invoices: list, today: date) -> str:
    from app.services.invoice_pdf import fmt_money

    rows = []
    for inv in invoices:
        days = (today - inv.due_date).days
        rows.append(
            (
                inv.number,
                f'{html_escape(inv.client_name)} · {html_escape(fmt_money(inv.subtotal, inv.currency))} · '
                f'<span style="color:#e11d48;">{days} day{"s" if days != 1 else ""} overdue</span> · '
                f'<a href="{_site()}/invoices/{inv.id}" style="color:{t.INDIGO};">Open</a>',
            )
        )
    total = sum((inv.subtotal for inv in invoices), 0)
    currency = invoices[0].currency if invoices else "USD"
    body = (
        t.h1(f"{len(invoices)} invoice{'s' if len(invoices) != 1 else ''} past due")
        + t.p("These were sent but haven't been marked paid. Open one to send a reminder or mark it paid.", muted=True)
        + t.big_number(fmt_money(total, currency), "outstanding")
        + t.details(rows, rows_html=True)
        + t.buttons(t.button("View invoices", f"{_site()}/invoices"))
    )
    return t.layout("reminder", f"{len(invoices)} overdue invoice(s), {fmt_money(total, currency)} outstanding", body)


def send_overdue_digest(user: User, invoices: list, today: date) -> None:
    _init_resend()
    _send(
        {
            "from": FROM_EMAIL,
            "to": [user.email],
            "subject": f"{len(invoices)} invoice{'s' if len(invoices) != 1 else ''} past due",
            "html": render_overdue_digest(user, invoices, today),
        },
        "overdue digest",
    )


# ---------------------------------------------------------------------------
# Calendar stopped syncing
# ---------------------------------------------------------------------------

FIX_STEPS = {
    "google": (
        "Google access to this calendar expired. In Google Calendar open Settings, your calendar, Integrate calendar, "
        "copy the secret address in iCal format, and add it in TimeIQ as a new calendar."
    ),
    "ics_url": (
        "Get a fresh link and paste it into TimeIQ with Replace link. "
        "Outlook: Settings, Calendar, Shared calendars, Publish a calendar, then copy the ICS link. "
        "iCloud: in the Calendar app, share the calendar as a Public Calendar and copy the link. "
        "Google: Settings, your calendar, Integrate calendar, then copy the secret address in iCal format."
    ),
}


def render_calendar_broken(user: User, source) -> str:
    since = source.failing_since or source.last_sync_attempt_at
    tz = user.timezone or "America/New_York"
    rows = [("Calendar", source.name), ("Problem", source.last_sync_error or "Unknown error")]
    if source.last_synced_at:
        rows.append(("Last good sync", _format_datetime(source.last_synced_at, tz)))
    body = (
        t.h1(f"{source.name} stopped syncing")
        + t.p(
            f"TimeIQ hasn't been able to read this calendar since {_format_datetime(since, tz)}. "
            "Until it's fixed, new events on it won't block time on your booking page, so clients could book over them."
        )
        + t.details(rows)
        + t.p(FIX_STEPS.get(source.type, FIX_STEPS["ics_url"]))
        + t.buttons(t.button("Fix it in TimeIQ", f"{_site()}/calendars"))
        + t.p("TimeIQ will keep checking once a day and stop warning you as soon as it syncs again.", muted=True)
    )
    return t.layout("reminder", f"{source.name} stopped syncing with TimeIQ", body)


def send_calendar_broken(user: User, source) -> None:
    if not user.email:
        return
    _init_resend()
    _send(
        {
            "from": FROM_EMAIL,
            "to": [user.email],
            "subject": f"Your {source.name} calendar stopped syncing",
            "html": render_calendar_broken(user, source),
        },
        "calendar broken notice",
    )


# ---------------------------------------------------------------------------
# Emailed schedules
# ---------------------------------------------------------------------------

REPLY_EVENT_LIMIT = 40


def _event_line(row: dict, tz_name: str) -> tuple[str, str]:
    tz = _zone(tz_name)
    start = row["starts_at"].astimezone(tz)
    day = start.strftime("%a %b %-d")
    if row.get("is_all_day"):
        return day, f"{row['title']} (all day)"
    end = row["ends_at"].astimezone(tz)
    span = f"{start.strftime('%-I:%M %p')}–{end.strftime('%-I:%M %p')}".replace(":00 ", " ")
    return day, f"{row['title']}, {span}"


def render_schedule_import(user: User, record, rows: list[dict], schedule_name: str | None) -> tuple[str, str]:
    """(subject, html) for the reply to an emailed schedule."""
    tz = user.timezone or "America/New_York"
    what = schedule_name or record.subject or "your email"
    if record.status == "imported":
        rows = sorted(rows, key=lambda r: r["starts_at"])
        shown = rows[:REPLY_EVENT_LIMIT]
        subject = f"Added {len(rows)} event{'s' if len(rows) != 1 else ''} from {what}"
        body = (
            t.h1(subject)
            + t.p(
                f"They're on your TimeIQ calendar now, in {_zone(tz).key.replace('_', ' ')} time, so nobody can book over them. "
                "They also show up in your TimeIQ calendar feed on your phone."
            )
            + t.details([_event_line(r, tz) for r in shown])
            + (t.p(f"…and {len(rows) - len(shown)} more.", muted=True) if len(rows) > len(shown) else "")
            + t.buttons(
                t.button("See your calendars", f"{_site()}/calendars"),
                t.button("Undo this import", f"{_site()}/imports/undo?token={record.undo_token}", secondary=True),
            )
            + t.p("Something wrong? Undo it, then forward the schedule again with a note about what to fix.", muted=True)
        )
        return subject, t.layout("reminder", subject, body)
    if record.status == "rejected":
        subject = "We couldn't add that schedule"
        message = record.error or "That email couldn't be imported."
    elif record.status == "empty":
        subject = "We didn't find a schedule in that email"
        message = (
            "TimeIQ couldn't find any dates and times in it. Forward the email with the schedule in it, or attach "
            "the PDF, a screenshot or an .ics file."
        )
    else:
        subject = "Something went wrong adding that schedule"
        message = "TimeIQ hit an error reading it. Please try again in a few minutes; nothing was added."
    body = t.h1(subject) + t.p(message) + t.buttons(t.button("Open TimeIQ", f"{_site()}/calendars"))
    return subject, t.layout("reminder", subject, body)


def send_schedule_import_reply(user: User, record, rows: list[dict], schedule_name: str | None, to: list[str]) -> None:
    if not to:
        return
    _init_resend()
    subject, html = render_schedule_import(user, record, rows, schedule_name)
    _send({"from": FROM_EMAIL, "to": to, "subject": subject, "html": html}, "schedule import reply")


# ---------------------------------------------------------------------------
# Welcome
# ---------------------------------------------------------------------------


def render_welcome(user: User) -> str:
    first = (user.name or "").split(" ")[0] or "there"
    site = _site()
    body = (
        t.h1(f"Welcome, {first}.")
        + t.p("TimeIQ gives you one calm place to book meetings, log your hours, and send invoices. Three quick steps and you're set.")
        + t.checklist(
            [
                ("Share your booking link", f"Your page is live at {site}/book/{user.username}. Add an event type and send it to anyone.", f"{site}/event-types"),
                ("Connect your calendar", "Google or any ICS feed, so you're never double booked.", f"{site}/calendars"),
                ("Add your first client", "Set a rate, log this week's hours, and your first invoice is one click away.", f"{site}/clients"),
            ]
        )
        + t.buttons(t.button("Open your workspace", f"{site}/dashboard"))
        + t.p("I read every reply. If anything is confusing or missing, tell me and I'll fix it.")
        + t.signoff(MAKER_NAME, MAKER_ROLE)
    )
    return t.layout("welcome", "Three quick steps to your first booking and invoice", body)


def send_welcome(user: User) -> None:
    if not user.email:
        return
    _init_resend()
    _send(
        {
            "from": f"{MAKER_NAME} at TimeIQ <bookings@timeiq.app>",
            "to": [user.email],
            "reply_to": MAKER_EMAIL,
            "subject": "Welcome to TimeIQ",
            "html": render_welcome(user),
        },
        "welcome",
    )


def render_monthly_drafts_digest(user: User, invoices: list, start: date, end: date) -> str:
    from app.services.invoice_pdf import fmt_money

    rows = [
        (inv.number, f'{html_escape(inv.client_name)} · {html_escape(fmt_money(inv.subtotal, inv.currency))} · <a href="{_site()}/invoices/{inv.id}" style="color:{t.INDIGO};">Review and send</a>')
        for inv in invoices
    ]
    total = sum((inv.subtotal for inv in invoices), 0)
    currency = invoices[0].currency if invoices else "USD"
    n = len(invoices)
    body = (
        t.h1(f"{n} draft invoice{'s' if n != 1 else ''} ready for {start.strftime('%B')}")
        + t.p(f"Unbilled hours from {_fmt_date(start)} to {_fmt_date(end)} were rolled into drafts. Nothing has been sent; open each one, check the lines, and hit Send.", muted=True)
        + t.big_number(fmt_money(total, currency), "ready to bill")
        + t.details(rows, rows_html=True)
        + t.buttons(t.button("Review drafts", f"{_site()}/invoices"))
    )
    return t.layout("invoice", f"{n} draft invoice(s) for {start.strftime('%B')}: {fmt_money(total, currency)}", body)


def send_monthly_drafts_digest(user: User, invoices: list, start: date, end: date) -> None:
    _init_resend()
    _send(
        {
            "from": FROM_EMAIL,
            "to": [user.email],
            "subject": f"{len(invoices)} draft invoice{'s' if len(invoices) != 1 else ''} ready for {start.strftime('%B')}",
            "html": render_monthly_drafts_digest(user, invoices, start, end),
        },
        "monthly drafts digest",
    )


# ---------------------------------------------------------------------------
# Group meetings
# ---------------------------------------------------------------------------


def _organizer_name(meeting) -> str:
    return meeting.organizer.name or meeting.organizer.email


def _group_ics(meeting, method: str = "REQUEST") -> dict:
    from app.services.ics_generator import generate_group_ics

    attendees = [(meeting.organizer.name, meeting.organizer.email)] + [(p.name, p.email) for p in meeting.participants]
    content = generate_group_ics(
        uid=f"group-{meeting.id}@timeiq.app",
        sequence=meeting.ical_sequence or 0,
        method=method,
        summary=meeting.title,
        description=(meeting.note or "") + f"\n\nScheduled with TimeIQ: {_site()}",
        starts_at=meeting.starts_at,
        ends_at=meeting.ends_at,
        attendees=attendees,
        location=meeting.location,
    )
    return {
        "filename": "cancel.ics" if method == "CANCEL" else "invite.ics",
        "content": content,
        "content_type": f"text/calendar; method={method}",
    }


def _window_text(meeting) -> str:
    return f"{meeting.window_start.strftime('%a %b %-d')} to {meeting.window_end.strftime('%a %b %-d')}"


def _timeiq_note() -> str:
    return t.p_html(
        f'Already on TimeIQ? Sign in on that page and share your calendar in one click. Only free and busy '
        f'times are shared, never what your events are. Not yet? <a href="{_site()}" style="color:{t.INDIGO};">TimeIQ</a> '
        f"finds a time with anyone and puts emailed schedules on your calendar.",
        muted=True,
    )


def _pick_url(participant, start: datetime | None = None) -> str:
    base = f"{_site()}/meet/{participant.token}"
    if start is None:
        return base
    from urllib.parse import quote

    return f"{base}?pick={quote(start.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'))}"


def _time_buttons(participant, suggested: list[datetime], tz: str) -> str:
    """Each suggested time as its own one-tap link (a short list, Luna-style)."""
    rows = "".join(
        f'<tr><td style="padding:4px 0;"><a href="{html_escape(_pick_url(participant, s), quote=True)}" '
        f'style="display:inline-block;min-width:240px;padding:11px 16px;border:1px solid {t.CARD_BORDER};border-radius:12px;'
        f'font-family:{t.FONT};font-size:15px;font-weight:600;color:{t.INK};text-decoration:none;background:#ffffff;">'
        f"{html_escape(_local(s, tz))}</a></td></tr>"
        for s in suggested
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;">{rows}</table>'


def render_group_invite(meeting, participant, suggested: list[datetime] | None = None) -> str:
    org = _organizer_name(meeting)
    tz = meeting.organizer.timezone or "UTC"
    rows = [
        ("Meeting", html_escape(meeting.title)),
        ("Length", f"{meeting.duration_minutes} minutes"),
    ]
    if meeting.location:
        rows.append(("Where", html_escape(meeting.location)))
    if suggested:
        picker = (
            t.p("Tap a time that works for you:", muted=True)
            + _time_buttons(participant, suggested, tz)
            + t.p_html(
                f'None of these work? <a href="{_pick_url(participant)}" style="color:{t.INDIGO};">Pick a different time</a>.',
                muted=True,
            )
        )
    else:
        picker = t.buttons(t.button("Pick times that work", _pick_url(participant)))
    body = (
        t.h1(f"{org} is finding a time to meet.")
        + (t.p(meeting.note) if meeting.note else "")
        + t.details(rows, rows_html=True)
        + picker
        + _timeiq_note()
    )
    return t.layout("reminder", f"{org} wants to find a time for {meeting.title}", body)


def send_group_invite(meeting, participant, reminder: bool = False, suggested: list[datetime] | None = None) -> None:
    _init_resend()
    org = _organizer_name(meeting)
    _send(
        {
            "from": FROM_EMAIL,
            "to": [participant.email],
            "reply_to": meeting.organizer.email,
            "subject": f"{'Reminder: ' if reminder else ''}{org} is finding a time for {meeting.title}",
            "html": render_group_invite(meeting, participant, suggested),
        },
        "group invite",
    )


def render_group_all_answered(meeting, best: dict | None) -> str:
    tz = meeting.organizer.timezone or "UTC"
    n = len(meeting.participants)
    if best and best["yes"] == n:
        start = datetime.fromisoformat(best["start"].replace("Z", "+00:00"))
        headline = f"Everyone can make {_format_datetime(start, tz)}."
    elif best and best["yes"]:
        start = datetime.fromisoformat(best["start"].replace("Z", "+00:00"))
        headline = f"Best time: {_format_datetime(start, tz)}, {best['yes']} of {n} can make it."
    else:
        headline = "Everyone answered, but no time works for all of you."
    body = (
        t.h1(f"Everyone answered for {meeting.title}.")
        + t.p(headline)
        + t.p("Open the meeting to book it. Everyone gets a calendar invite.", muted=True)
        + t.buttons(t.button("Book a time", f"{_site()}/meetings/{meeting.id}"))
    )
    return t.layout("new-booking", f"Everyone answered for {meeting.title}", body)


def send_group_all_answered(meeting, best: dict | None) -> None:
    if meeting.source == "email" and meeting.thread_ids:
        send_agent_all_answered(meeting, best)
        return
    _init_resend()
    _send(
        {
            "from": FROM_EMAIL,
            "to": [meeting.organizer.email],
            "subject": f"Everyone answered: {meeting.title}",
            "html": render_group_all_answered(meeting, best),
        },
        "group all answered",
    )


def render_group_booked(meeting, tz: str) -> str:
    org = _organizer_name(meeting)
    rows = [
        ("Meeting", html_escape(meeting.title)),
        ("When", html_escape(_when(meeting.starts_at, meeting.ends_at, tz))),
        ("Who", html_escape(", ".join([org] + [p.name or p.email for p in meeting.participants]))),
    ]
    if meeting.location:
        rows.append(("Where", html_escape(meeting.location)))
    body = (
        t.h1(f"{meeting.title} is booked.")
        + t.p("A calendar invite is attached. Open it to add this to your calendar.", muted=True)
        + t.details(rows, rows_html=True)
        + t.p(f"Need to change something? Reply to reach {org}.", muted=True)
    )
    return t.layout("confirmed", f"{meeting.title}: {_format_datetime(meeting.starts_at, tz)}", body)


def send_group_booked(meeting) -> None:
    if meeting.source == "email" and meeting.thread_ids:
        send_agent_booked(meeting, None)
        return
    _init_resend()
    invite = _group_ics(meeting)
    org_tz = meeting.organizer.timezone or "UTC"
    for p in meeting.participants:
        _send(
            {
                "from": FROM_EMAIL,
                "to": [p.email],
                "reply_to": meeting.organizer.email,
                "subject": f"Booked: {meeting.title}, {_format_datetime(meeting.starts_at, org_tz)}",
                "html": render_group_booked(meeting, org_tz),
                "attachments": [invite],
            },
            "group booked",
        )
    _send(
        {
            "from": FROM_EMAIL,
            "to": [meeting.organizer.email],
            "subject": f"Booked: {meeting.title}, {_format_datetime(meeting.starts_at, org_tz)}",
            "html": render_group_booked(meeting, org_tz),
            "attachments": [invite],
        },
        "group booked (organizer)",
    )


def send_group_cancelled(meeting) -> None:
    _init_resend()
    org = _organizer_name(meeting)
    tz = meeting.organizer.timezone or "UTC"
    body = (
        t.h1(f"{meeting.title} is cancelled.")
        + t.p(f"{org} cancelled the meeting on {_format_datetime(meeting.starts_at, tz)}. The attached update removes it from your calendar.", muted=True)
    )
    html = t.layout("cancelled", f"Cancelled: {meeting.title}", body)
    cancel = _group_ics(meeting, "CANCEL")
    for email in [p.email for p in meeting.participants] + [meeting.organizer.email]:
        _send(
            {
                "from": FROM_EMAIL,
                "to": [email],
                "reply_to": meeting.organizer.email,
                "subject": f"Cancelled: {meeting.title}",
                "html": html,
                "attachments": [cancel],
            },
            "group cancelled",
        )


# ---------------------------------------------------------------------------
# cc TimeIQ (the meeting agent; see services/meeting_agent.py)
# ---------------------------------------------------------------------------


def _first_name(user: User) -> str:
    return (user.name or user.email.split("@")[0]).split()[0]


def _agent_from(meeting) -> str:
    from app.services.email_import import address_for

    return f"{_first_name(meeting.organizer)} via TimeIQ <{address_for(meeting.organizer)}>"


def _re(subject: str | None) -> str:
    s = (subject or "").strip() or "Finding a time"
    return s if s.lower().startswith("re:") else f"Re: {s}"


def _thread_headers(meeting, in_reply_to: str | None) -> dict:
    refs = list(meeting.thread_ids or [])[-12:]
    headers = {"References": " ".join(refs)} if refs else {}
    target = in_reply_to or (refs[-1] if refs else None)
    if target:
        headers["In-Reply-To"] = target
    return headers


def _agent_html(paragraphs: list[str], footer: str) -> str:
    """A plain, personal-looking email: no banner, just text, like an assistant would write."""
    body = "".join(f'<p style="margin:0 0 14px;">{p}</p>' for p in paragraphs)
    return (
        f'<div style="font-family:{t.FONT};font-size:15px;line-height:1.55;color:{t.INK};max-width:560px;">{body}'
        f'<p style="margin:22px 0 0;font-size:12px;color:{t.MUTED};">{footer}</p></div>'
    )


def _footer(meeting) -> str:
    return (
        f'Sent by TimeIQ, {html_escape(_first_name(meeting.organizer))}\'s scheduling assistant. '
        f'<a href="{_site()}/?ref=agent" style="color:{t.MUTED};">Get your own</a>, $19/year.'
    )


def _local(dt: datetime, tz_name: str) -> str:
    local = dt.astimezone(_zone(tz_name))
    return local.strftime("%a %b %-d, %-I:%M %p").replace(":00 ", " ") + " " + local.strftime("%Z")


def _send_agent(meeting, to: list[str], subject: str, html: str, in_reply_to: str | None, what: str, attachments=None) -> None:
    _init_resend()
    payload = {
        "from": _agent_from(meeting),
        "to": to,
        "subject": _re(subject),
        "html": html,
        "headers": _thread_headers(meeting, in_reply_to),
    }
    if attachments:
        payload["attachments"] = attachments
    _send(payload, what)


def _names(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def render_agent_proposal(meeting, options: list[datetime], intro: str | None = None, participant=None) -> str:
    """The proposal for one guest, with one-tap links that only that guest gets
    (a link is that person's credential). Without ``participant``, the
    organizer's copy: the same times, and no participant links."""
    if participant is None:
        return _render_agent_summary(meeting, options, intro)
    org = _first_name(meeting.organizer)
    tz = meeting.organizer.timezone or "UTC"
    first = html_escape((participant.name or participant.email).split()[0])
    paras = [
        f"Hi {first},",
        intro
        or f"I'm TimeIQ, helping {html_escape(org)} find {meeting.duration_minutes} minutes for "
        f"<strong>{html_escape(meeting.title)}</strong>.",
    ]
    others = [html_escape((p.name or p.email).split()[0]) for p in meeting.participants if p is not participant]
    if others:
        paras.append(f"I'm asking {_names(others)} too. Each of you gets your own link, so this one is just for you.")
    if options:
        items = "".join(
            f'<li style="margin:4px 0;"><a href="{html_escape(_pick_url(participant, s), quote=True)}" '
            f'style="color:{t.INDIGO};font-weight:600;">{html_escape(_local(s, tz))}</a></li>'
            for s in options
        )
        paras.append(f"Here are {len(options)} times that work for {html_escape(org)}. Tap one, or just reply:"
                     f'<ul style="margin:6px 0 0;padding-left:20px;">{items}</ul>')
        paras.append(f'None of these work? <a href="{_pick_url(participant)}" style="color:{t.INDIGO};">Pick a different time</a>.')
    else:
        paras.append(f"{html_escape(org)} has no open time in that range yet. "
                     f'<a href="{_pick_url(participant)}" style="color:{t.INDIGO};">Tap here</a> and I\'ll show times as they open up.')
    paras.append(f"Once everyone's answered, I'll check with {html_escape(org)} and send the calendar invite.")
    return _agent_html(paras, _footer(meeting))


def _render_agent_summary(meeting, options: list[datetime], intro: str | None) -> str:
    org = html_escape(_first_name(meeting.organizer))
    tz = meeting.organizer.timezone or "UTC"
    who = _names([html_escape((p.name or p.email).split()[0]) for p in meeting.participants])
    title = html_escape(meeting.title)
    paras = [f"Hi {org},"]
    if intro:
        paras.append("The times they offered clash with your calendar, so I suggested some of yours.")
    if options:
        items = "".join(f'<li style="margin:2px 0;">{html_escape(_local(s, tz))}</li>' for s in options)
        paras.append(f"I've sent {who} these times for <strong>{title}</strong>, each with their own link to answer:"
                     f'<ul style="margin:6px 0 0;padding-left:20px;">{items}</ul>')
    else:
        paras.append(f"You have no open time in that range yet, so I've sent {who} a link for <strong>{title}</strong> "
                     "that shows times as they open up.")
    paras.append(f'I\'ll let you know once everyone\'s answered. <a href="{_site()}/meetings/{meeting.id}" '
                 f'style="color:{t.INDIGO};">Open the meeting in TimeIQ</a>')
    return _agent_html(paras, _footer(meeting))


def send_agent_proposal(meeting, options: list[datetime], detail: dict, intro: str | None = None) -> None:
    """One email per person, all on the thread: the organizer's copy has no
    participant links, and each guest's has only their own."""
    subject = meeting.thread_subject or meeting.title
    in_reply_to = detail.get("message_id")
    _send_agent(meeting, [meeting.organizer.email], subject, render_agent_proposal(meeting, options, intro),
                in_reply_to, "agent proposal (organizer)")
    for p in meeting.participants:
        _send_agent(meeting, [p.email], subject, render_agent_proposal(meeting, options, intro, participant=p),
                    in_reply_to, "agent proposal")


def send_agent_ack(meeting, participant, picked: list[datetime], detail: dict) -> None:
    tz = meeting.organizer.timezone or "UTC"
    first = html_escape((participant.name or participant.email).split()[0])
    if picked:
        times = ", ".join(html_escape(_local(s, tz)) for s in picked[:6]) + ("…" if len(picked) > 6 else "")
        line = f"Thanks {first}, noted: {times}."
    else:
        line = f"Thanks {first}, noted that none of those times work. I'll let {html_escape(_first_name(meeting.organizer))} know."
    link = f'<a href="{_site()}/meet/{participant.token}" style="color:{t.INDIGO};">See or change your times</a>.'
    _send_agent(meeting, [participant.email], meeting.thread_subject or meeting.title,
                _agent_html([line, link], _footer(meeting)), detail.get("message_id"), "agent ack")


def send_agent_booked(meeting, detail: dict | None) -> None:
    tz = meeting.organizer.timezone or "UTC"
    when = html_escape(_when(meeting.starts_at, meeting.ends_at, tz))
    paras = [
        f"<strong>{html_escape(meeting.title)}</strong> is booked for {when}.",
        "The calendar invite is attached. Open it to add it to your calendar.",
    ]
    if meeting.location:
        paras.append(f"Where: {html_escape(meeting.location)}")
    to = [meeting.organizer.email] + [p.email for p in meeting.participants]
    _send_agent(meeting, to, meeting.thread_subject or meeting.title, _agent_html(paras, _footer(meeting)),
                (detail or {}).get("message_id"), "agent booked", attachments=[_group_ics(meeting)])


def send_agent_note(meeting, detail: dict, to: list[str], text: str, link: bool = False) -> None:
    paras = [html_escape(text)]
    if link:
        paras.append(f'<a href="{_site()}/meetings/{meeting.id}" style="color:{t.INDIGO};">Open the meeting in TimeIQ</a>')
    _send_agent(meeting, to, meeting.thread_subject or meeting.title, _agent_html(paras, _footer(meeting)),
                detail.get("message_id"), "agent note")


def send_agent_all_answered(meeting, best: dict | None) -> None:
    """To the organizer only, on the thread, so a reply of "book it" reaches TimeIQ."""
    tz = meeting.organizer.timezone or "UTC"
    n = len(meeting.participants)
    if best and best["yes"]:
        start = datetime.fromisoformat(best["start"].replace("Z", "+00:00"))
        who = "everyone" if best["yes"] == n else f"{best['yes']} of {n}"
        lines = [
            f"Everyone has answered for <strong>{html_escape(meeting.title)}</strong>. "
            f"The best time is {html_escape(_local(start, tz))}, and {who} can make it.",
            'Reply "book it" and I\'ll send everyone the invite, or name a different time.',
        ]
    else:
        lines = [f"Everyone has answered for <strong>{html_escape(meeting.title)}</strong>, but no time works for all of you."]
    lines.append(f'<a href="{_site()}/meetings/{meeting.id}" style="color:{t.INDIGO};">See every answer in TimeIQ</a>')
    _send_agent(meeting, [meeting.organizer.email], meeting.thread_subject or meeting.title,
                _agent_html(lines, _footer(meeting)), None, "agent all answered")


def send_agent_accept(meeting, detail: dict) -> None:
    """Accept a time someone offered, on the thread, and ask them to send the invite."""
    tz = meeting.organizer.timezone or "UTC"
    org = html_escape(_first_name(meeting.organizer))
    names = [html_escape((p.name or p.email).split()[0]) for p in meeting.participants]
    hello = f"Hi {names[0]}," if len(names) == 1 else "Hi all,"
    paras = [
        hello,
        f"I'm TimeIQ, {org}'s scheduling assistant. <strong>{html_escape(_local(meeting.starts_at, tz))}</strong> works for {org}.",
        f"Please send the calendar invite to {html_escape(meeting.organizer.email)}. I've held the time on {org}'s calendar.",
    ]
    to = [meeting.organizer.email] + [p.email for p in meeting.participants]
    _send_agent(meeting, to, meeting.thread_subject or meeting.title, _agent_html(paras, _footer(meeting)),
                detail.get("message_id"), "agent accept")
