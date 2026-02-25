from __future__ import annotations

import logging
from html import escape as html_escape
from zoneinfo import ZoneInfo

import resend

from app.config import settings
from app.models.booking import Booking
from app.models.event_type import EventType
from app.models.user import User
from app.services.ics_generator import generate_booking_ics

logger = logging.getLogger(__name__)

FROM_EMAIL = "TimeIQ <bookings@timeiq.app>"


def _init_resend() -> None:
    resend.api_key = settings.RESEND_API_KEY


def _format_datetime(dt, tz_name: str) -> str:
    """Format datetime converted to the given timezone."""
    local = dt.astimezone(ZoneInfo(tz_name))
    # e.g. "Wednesday, February 11, 2026 at 08:00 AM EST"
    return local.strftime("%A, %B %d, %Y at %I:%M %p %Z")


def _format_time(dt, tz_name: str) -> str:
    """Format just the time portion in the given timezone."""
    local = dt.astimezone(ZoneInfo(tz_name))
    return local.strftime("%I:%M %p %Z")


async def send_booking_confirmation(
    booking: Booking,
    event_type: EventType,
    host: User,
) -> None:
    """
    Send booking confirmation emails to both the host and the visitor.
    Each recipient sees the time in their own timezone.
    """
    _init_resend()

    host_name = host.name or host.email
    host_tz = host.timezone or "UTC"
    visitor_tz = booking.timezone or "UTC"

    # Generate separate ICS for each recipient so the calendar summary is personalised
    visitor_ics = generate_booking_ics(
        booking_id=booking.id,
        summary=f"{host_name} 1:1",
        description=(
            f"Booking with {host_name}\n"
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
    host_ics = generate_booking_ics(
        booking_id=booking.id,
        summary=f"{booking.visitor_name} 1:1",
        description=(
            f"Booking with {booking.visitor_name}\n"
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

    # Build location HTML snippet for emails
    location_html = ""
    if event_type.location:
        loc = html_escape(event_type.location)
        if event_type.location.startswith(("http://", "https://")):
            location_html = f'<p><strong>Location:</strong> <a href="{loc}">{loc}</a></p>'
        else:
            location_html = f"<p><strong>Location:</strong> {loc}</p>"

    cancel_url = (
        f"{settings.FRONTEND_URL}/bookings/{booking.id}/cancel"
        f"?token={booking.cancel_token}"
    )

    # Email to visitor — show time in visitor's timezone
    visitor_starts = _format_datetime(booking.starts_at, visitor_tz)
    visitor_ends = _format_time(booking.ends_at, visitor_tz)
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [booking.visitor_email],
                "subject": f"Confirmed: {host_name} 1:1",
                "html": (
                    f"<h2>Your booking is confirmed!</h2>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>With:</strong> {host_name}</p>"
                    f"<p><strong>When:</strong> {visitor_starts} - {visitor_ends}</p>"
                    f"<p><strong>Duration:</strong> {event_type.duration_minutes} minutes</p>"
                    + location_html
                    + f"<br>"
                    f'<p>Need to cancel? <a href="{cancel_url}">Cancel this booking</a></p>'
                ),
                "attachments": [
                    {
                        "filename": "invite.ics",
                        "content": visitor_ics,
                        "content_type": "text/calendar; method=REQUEST",
                    }
                ],
            }
        )
    except Exception as e:
        logger.error(f"Failed to send confirmation to visitor: {e}")

    # Email to host — show time in host's timezone
    host_starts = _format_datetime(booking.starts_at, host_tz)
    host_ends = _format_time(booking.ends_at, host_tz)
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [host.email],
                "subject": f"New booking: {booking.visitor_name} 1:1",
                "html": (
                    f"<h2>You have a new booking!</h2>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>Guest:</strong> {booking.visitor_name} ({booking.visitor_email})</p>"
                    f"<p><strong>When:</strong> {host_starts} - {host_ends}</p>"
                    f"<p><strong>Duration:</strong> {event_type.duration_minutes} minutes</p>"
                    + location_html
                    + (
                        f"<p><strong>Notes:</strong> {html_escape(booking.visitor_notes)}</p>"
                        if booking.visitor_notes
                        else ""
                    )
                ),
                "attachments": [
                    {
                        "filename": "invite.ics",
                        "content": host_ics,
                        "content_type": "text/calendar; method=REQUEST",
                    }
                ],
            }
        )
    except Exception as e:
        logger.error(f"Failed to send confirmation to host: {e}")


async def send_cancellation_notice(
    booking: Booking,
    event_type: EventType,
    host: User,
) -> None:
    """
    Send cancellation notice emails to both the host and the visitor.
    """
    _init_resend()

    host_name = host.name or host.email
    host_tz = host.timezone or "UTC"
    visitor_tz = booking.timezone or "UTC"

    # Email to visitor — their timezone
    visitor_starts = _format_datetime(booking.starts_at, visitor_tz)
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [booking.visitor_email],
                "subject": f"Cancelled: {host_name} 1:1",
                "html": (
                    f"<h2>Booking Cancelled</h2>"
                    f"<p>The following booking has been cancelled:</p>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>With:</strong> {host_name}</p>"
                    f"<p><strong>Was scheduled for:</strong> {visitor_starts}</p>"
                ),
            }
        )
    except Exception as e:
        logger.error(f"Failed to send cancellation to visitor: {e}")

    # Email to host — their timezone
    host_starts = _format_datetime(booking.starts_at, host_tz)
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [host.email],
                "subject": f"Cancelled: {booking.visitor_name} 1:1",
                "html": (
                    f"<h2>Booking Cancelled</h2>"
                    f"<p>The following booking has been cancelled:</p>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>Guest:</strong> {booking.visitor_name} ({booking.visitor_email})</p>"
                    f"<p><strong>Was scheduled for:</strong> {host_starts}</p>"
                ),
            }
        )
    except Exception as e:
        logger.error(f"Failed to send cancellation to host: {e}")
