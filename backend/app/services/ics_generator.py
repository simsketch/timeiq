from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from icalendar import Calendar, Event, vText


SERVICE_EMAIL = "bookings@timeiq.app"


def generate_booking_ics(
    booking_id: UUID,
    summary: str,
    description: str,
    starts_at: datetime,
    ends_at: datetime,
    host_name: str | None,
    host_email: str,
    visitor_name: str,
    visitor_email: str,
) -> str:
    """
    Generate an .ics file content string for a booking.
    ORGANIZER must match the email sender for Gmail to render the inline event.
    """
    cal = Calendar()
    cal.add("prodid", "-//TimeIQ//Booking//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "REQUEST")

    event = Event()
    event.add("uid", f"{booking_id}@timeiq.app")
    event.add("dtstart", starts_at)
    event.add("dtend", ends_at)
    event.add("dtstamp", datetime.now(timezone.utc))
    event.add("summary", summary)
    event.add("description", description)
    event.add("status", "CONFIRMED")

    # Organizer must match the From address for Gmail compatibility
    organizer = vText(f"mailto:{SERVICE_EMAIL}")
    event.add("organizer", organizer, parameters={"CN": "TimeIQ"})

    # Attendee - visitor
    attendee = vText(f"mailto:{visitor_email}")
    event.add(
        "attendee",
        attendee,
        parameters={
            "CN": visitor_name,
            "ROLE": "REQ-PARTICIPANT",
            "RSVP": "TRUE",
        },
    )

    # Attendee - host
    organizer_name = host_name or host_email
    host_attendee = vText(f"mailto:{host_email}")
    event.add(
        "attendee",
        host_attendee,
        parameters={
            "CN": organizer_name,
            "ROLE": "REQ-PARTICIPANT",
        },
    )

    cal.add_component(event)
    return cal.to_ical().decode("utf-8")
