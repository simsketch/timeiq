from __future__ import annotations

import logging

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


def _format_datetime(dt) -> str:
    """Format datetime in a human-readable way."""
    return dt.strftime("%A, %B %d, %Y at %I:%M %p %Z")


async def send_booking_confirmation(
    booking: Booking,
    event_type: EventType,
    host: User,
) -> None:
    """
    Send booking confirmation emails to both the host and the visitor.
    """
    _init_resend()

    starts_str = _format_datetime(booking.starts_at)
    ends_str = booking.ends_at.strftime("%I:%M %p %Z")
    host_name = host.name or host.email

    # Generate ICS attachment
    ics_content = generate_booking_ics(
        booking_id=booking.id,
        summary=f"{event_type.name} with {host_name}",
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
    )

    cancel_url = (
        f"{settings.FRONTEND_URL}/bookings/{booking.id}/cancel"
        f"?token={booking.cancel_token}"
    )

    # Email to visitor
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [booking.visitor_email],
                "subject": f"Confirmed: {event_type.name} with {host_name}",
                "html": (
                    f"<h2>Your booking is confirmed!</h2>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>With:</strong> {host_name}</p>"
                    f"<p><strong>When:</strong> {starts_str} - {ends_str}</p>"
                    f"<p><strong>Duration:</strong> {event_type.duration_minutes} minutes</p>"
                    f"<br>"
                    f'<p>Need to cancel? <a href="{cancel_url}">Cancel this booking</a></p>'
                ),
                "attachments": [
                    {
                        "filename": "invite.ics",
                        "content": ics_content,
                        "content_type": "text/calendar; method=REQUEST",
                    }
                ],
            }
        )
    except Exception as e:
        logger.error(f"Failed to send confirmation to visitor: {e}")

    # Email to host
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [host.email],
                "subject": f"New booking: {event_type.name} with {booking.visitor_name}",
                "html": (
                    f"<h2>You have a new booking!</h2>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>Guest:</strong> {booking.visitor_name} ({booking.visitor_email})</p>"
                    f"<p><strong>When:</strong> {starts_str} - {ends_str}</p>"
                    f"<p><strong>Duration:</strong> {event_type.duration_minutes} minutes</p>"
                    + (
                        f"<p><strong>Notes:</strong> {booking.visitor_notes}</p>"
                        if booking.visitor_notes
                        else ""
                    )
                ),
                "attachments": [
                    {
                        "filename": "invite.ics",
                        "content": ics_content,
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

    starts_str = _format_datetime(booking.starts_at)
    host_name = host.name or host.email

    # Email to visitor
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [booking.visitor_email],
                "subject": f"Cancelled: {event_type.name} with {host_name}",
                "html": (
                    f"<h2>Booking Cancelled</h2>"
                    f"<p>The following booking has been cancelled:</p>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>With:</strong> {host_name}</p>"
                    f"<p><strong>Was scheduled for:</strong> {starts_str}</p>"
                ),
            }
        )
    except Exception as e:
        logger.error(f"Failed to send cancellation to visitor: {e}")

    # Email to host
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [host.email],
                "subject": f"Cancelled: {event_type.name} with {booking.visitor_name}",
                "html": (
                    f"<h2>Booking Cancelled</h2>"
                    f"<p>The following booking has been cancelled:</p>"
                    f"<p><strong>Event:</strong> {event_type.name}</p>"
                    f"<p><strong>Guest:</strong> {booking.visitor_name} ({booking.visitor_email})</p>"
                    f"<p><strong>Was scheduled for:</strong> {starts_str}</p>"
                ),
            }
        )
    except Exception as e:
        logger.error(f"Failed to send cancellation to host: {e}")
