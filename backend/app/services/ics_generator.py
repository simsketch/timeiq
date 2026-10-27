from __future__ import annotations

from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Iterable
from uuid import UUID

from icalendar import Calendar, Event, vText

from app.models.booking import Booking
from app.models.cached_event import CachedEvent


SERVICE_EMAIL = "bookings@timeiq.app"


def ical_uid_for(booking: Booking) -> str:
    """The calendar UID of a booking's invite. Every booking in a reschedule
    chain shares the first booking's UID so calendar clients move one event;
    legacy rows without a stored UID used their own id."""
    return booking.ical_uid or f"{booking.id}@timeiq.app"


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
    location: str | None = None,
    *,
    uid: str | None = None,
    sequence: int = 0,
    method: str = "REQUEST",
) -> str:
    """
    Generate an .ics file content string for a booking.
    ORGANIZER must match the email sender for Gmail to render the inline event.

    method="REQUEST" creates or (same uid, higher sequence) updates the event;
    method="CANCEL" removes it from the attendee's calendar.
    """
    if method not in ("REQUEST", "CANCEL"):
        raise ValueError(f"Unsupported iTIP method: {method}")
    cal = Calendar()
    cal.add("prodid", "-//TimeIQ//Booking//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", method)

    event = Event()
    event.add("uid", uid or f"{booking_id}@timeiq.app")
    event.add("sequence", sequence)
    event.add("dtstart", starts_at)
    event.add("dtend", ends_at)
    event.add("dtstamp", datetime.now(timezone.utc))
    event.add("summary", summary)
    event.add("description", description)
    event.add("status", "CANCELLED" if method == "CANCEL" else "CONFIRMED")

    if location:
        event.add("location", location)
        if location.startswith("http://") or location.startswith("https://"):
            event.add("url", location)

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


def generate_group_ics(
    *,
    uid: str,
    sequence: int,
    method: str,
    summary: str,
    description: str,
    starts_at: datetime,
    ends_at: datetime,
    attendees: list[tuple[str | None, str]],
    location: str | None = None,
) -> str:
    """Invite for a group meeting: one event, every person as an attendee.
    ORGANIZER is the sending address so Gmail renders it inline."""
    if method not in ("REQUEST", "CANCEL"):
        raise ValueError(f"Unsupported iTIP method: {method}")
    cal = Calendar()
    cal.add("prodid", "-//TimeIQ//Group meeting//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", method)
    event = Event()
    event.add("uid", uid)
    event.add("sequence", sequence)
    event.add("dtstart", starts_at)
    event.add("dtend", ends_at)
    event.add("dtstamp", datetime.now(timezone.utc))
    event.add("summary", summary)
    event.add("description", description)
    event.add("status", "CANCELLED" if method == "CANCEL" else "CONFIRMED")
    if location:
        event.add("location", location)
        if location.startswith(("http://", "https://")):
            event.add("url", location)
    event.add("organizer", vText(f"mailto:{SERVICE_EMAIL}"), parameters={"CN": "TimeIQ"})
    for name, email in attendees:
        event.add(
            "attendee",
            vText(f"mailto:{email}"),
            parameters={"CN": name or email, "ROLE": "REQ-PARTICIPANT", "RSVP": "TRUE"},
        )
    cal.add_component(event)
    return cal.to_ical().decode("utf-8")


def _local_date(value: datetime | date, tz: tzinfo | None) -> date:
    if not isinstance(value, datetime):
        return value
    if tz is not None:
        value = value.astimezone(tz)
    return value.date()


def generate_feed_ics(
    calendar_name: str,
    bookings: Iterable[Booking],
    cached_events: Iterable[CachedEvent],
    obfuscate: bool,
    tz: tzinfo | None = None,
) -> str:
    """
    Generate a PUBLISH-method VCALENDAR aggregating TimeIQ bookings and
    cached external events for a single user. Used for calendar subscriptions.

    When obfuscate=True, titles are replaced with "Busy" and all descriptive
    detail (description, location, attendees) is omitted.

    ``tz`` is the owner's zone. All-day events are stored as the owner's local
    midnights in UTC, so their dates are read in that zone (in UTC a Tokyo
    all-day event would start the day before).
    """
    cal = Calendar()
    cal.add("prodid", "-//TimeIQ//Feed//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", calendar_name)

    now = datetime.now(timezone.utc)

    for booking in bookings:
        event = Event()
        event.add("uid", f"booking-{booking.id}@timeiq.app")
        event.add("dtstart", booking.starts_at)
        event.add("dtend", booking.ends_at)
        event.add("dtstamp", now)
        event.add("status", "CONFIRMED" if booking.status == "confirmed" else "CANCELLED")

        if obfuscate:
            event.add("summary", "Busy")
        else:
            et = booking.event_type
            title = et.name if et else "Booking"
            event.add("summary", f"{title} with {booking.visitor_name}")
            if booking.visitor_notes:
                event.add("description", booking.visitor_notes)
            if et and et.location:
                event.add("location", et.location)
                if et.location.startswith(("http://", "https://")):
                    event.add("url", et.location)

        cal.add_component(event)

    for ev in cached_events:
        event = Event()
        event.add("uid", f"cached-{ev.id}@timeiq.app")

        if ev.is_all_day:
            first, last = _local_date(ev.starts_at, tz), _local_date(ev.ends_at, tz)
            event.add("dtstart", first)
            event.add("dtend", last if last > first else first + timedelta(days=1))
        else:
            event.add("dtstart", ev.starts_at)
            event.add("dtend", ev.ends_at)

        event.add("dtstamp", now)
        event.add("status", "CONFIRMED")
        event.add("transp", "OPAQUE")

        if obfuscate or not ev.title:
            event.add("summary", "Busy")
        else:
            event.add("summary", ev.title)

        cal.add_component(event)

    return cal.to_ical().decode("utf-8")
