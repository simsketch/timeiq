"""Transactional email: booking confirmations and cancellations, invoices,
welcome, and overdue reminders. All messages share the layout in
email_templates so they look like one product."""
from __future__ import annotations

import base64
import logging
from datetime import date, datetime
from html import escape as html_escape
from zoneinfo import ZoneInfo

import resend

from app.config import settings
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.services import email_templates as t
from app.services.ics_generator import generate_booking_ics

logger = logging.getLogger(__name__)

FROM_EMAIL = "TimeIQ <bookings@timeiq.app>"
MAKER_NAME = "Elon"
MAKER_ROLE = "Maker of TimeIQ"
MAKER_EMAIL = "simsketch@gmail.com"


def _init_resend() -> None:
    resend.api_key = settings.RESEND_API_KEY


def _site() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def _format_datetime(dt, tz_name: str) -> str:
    local = dt.astimezone(ZoneInfo(tz_name))
    return local.strftime("%A, %B %d, %Y at %I:%M %p %Z")


def _format_time(dt, tz_name: str) -> str:
    local = dt.astimezone(ZoneInfo(tz_name))
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


def _ics(booking: Booking, event_type: EventType, host: User, summary: str) -> str:
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
    )


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------


def render_booking_confirmation_visitor(booking: Booking, event_type: EventType, host: User) -> str:
    host_name = host.name or host.email
    tz = booking.timezone or "UTC"
    cancel_url = f"{_site()}/bookings/{booking.id}/cancel?token={booking.cancel_token}"
    reschedule_url = f"{_site()}/bookings/{booking.id}/reschedule?token={booking.cancel_token}"
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
            "attachments": [{"filename": "invite.ics", "content": _ics(booking, event_type, host, f"{host_name} 1:1"), "content_type": "text/calendar; method=REQUEST"}],
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
            "attachments": [{"filename": "invite.ics", "content": _ics(booking, event_type, host, f"{booking.visitor_name} 1:1"), "content_type": "text/calendar; method=REQUEST"}],
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
    _init_resend()
    host_name = host.name or host.email
    _send(
        {
            "from": FROM_EMAIL,
            "to": [booking.visitor_email],
            "reply_to": host.email,
            "subject": f"Cancelled: {event_type.name} with {host_name}",
            "html": render_cancellation_visitor(booking, event_type, host),
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
        },
        "host cancellation",
    )


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


def render_invoice(invoice, sender: User, hosted_url: str, reminder_days: int | None = None) -> str:
    from app.services.invoice_pdf import fmt_money

    sender_name = sender.name or sender.email
    greeting = invoice.client_contact_name or invoice.client_name
    amount = fmt_money(invoice.subtotal, invoice.currency)
    if reminder_days is None:
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
        + t.p("Questions? Just reply to this email.", muted=True)
        + t.signoff(sender_name, sender.email)
    )
    return t.layout(hero, f"{headline}: {amount} due {_fmt_date(invoice.due_date)}", body)


def send_invoice(invoice, pdf_bytes: bytes, sender: User, hosted_url: str, reminder_days: int | None = None) -> None:
    """Email an invoice PDF to the client. Raises RuntimeError on failure so the
    API can report it, unlike booking mail which is best-effort."""
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
                "to": [invoice.client_billing_email],
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
