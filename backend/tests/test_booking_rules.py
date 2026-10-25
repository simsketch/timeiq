"""Booking/event-type rules that need no database: schema validation, intake
normalization and calendar invite identity."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest
from icalendar import Calendar
from pydantic import ValidationError

from app.routers.event_types import _normalize_intake
from app.schemas.booking import BookingCreate
from app.schemas.event_type import EventTypeCreate, EventTypeUpdate
from app.services import email as E
from app.services.ics_generator import generate_booking_ics, ical_uid_for

START = datetime(2026, 11, 2, 14, tzinfo=timezone.utc)
END = datetime(2026, 11, 2, 14, 30, tzinfo=timezone.utc)


def booking_payload(**kw):
    return {"visitor_name": "V", "visitor_email": "v@example.com", "starts_at": START.isoformat(), "timezone": "Asia/Tokyo", **kw}


# QA-024
@pytest.mark.parametrize("zone", ["Mars/Olympus", "../../etc/passwd", "/etc/localtime", "Not A Zone"])
def test_booking_rejects_unknown_timezones(zone):
    with pytest.raises(ValidationError):
        BookingCreate(**booking_payload(timezone=zone))


def test_booking_accepts_iana_timezones():
    assert BookingCreate(**booking_payload()).timezone == "Asia/Tokyo"
    assert BookingCreate(**booking_payload(timezone="UTC")).timezone == "UTC"


# QA-031
@pytest.mark.parametrize("field", ["name", "slug", "duration", "duration_minutes", "buffer_time", "color", "is_active", "collect_phone", "require_url"])
def test_event_update_rejects_null_for_required_fields(field):
    with pytest.raises(ValidationError):
        EventTypeUpdate(**{field: None})


def test_event_update_allows_null_for_nullable_fields():
    u = EventTypeUpdate(description=None, location=None, max_bookings_per_day=None)
    assert u.model_dump(exclude_unset=True) == {"description": None, "location": None, "max_bookings_per_day": None}


# QA-025 / QA-026
def test_create_intake_flags_require_implies_collect():
    flags = EventTypeCreate(name="x", duration=30, require_phone=True, collect_company=True).intake_flags()
    assert flags == {
        "collect_phone": True, "require_phone": True,
        "collect_company": True, "require_company": False,
        "collect_url": False, "require_url": False,
    }


def _et(**kw):
    base = {f"{k}_{f}": False for k in ("collect", "require") for f in ("phone", "company", "url")}
    return NS(**{**base, **kw})


def test_update_requiring_a_field_turns_collection_on():
    data = {"require_phone": True}
    _normalize_intake(_et(), data)
    assert data == {"require_phone": True, "collect_phone": True}


def test_update_with_explicit_conflict_keeps_required_field_visible():
    data = {"collect_phone": False, "require_phone": True}
    _normalize_intake(_et(), data)
    assert data["collect_phone"] is True and data["require_phone"] is True


def test_update_turning_collection_off_stops_requiring():
    data = {"collect_company": False}
    _normalize_intake(_et(collect_company=True, require_company=True), data)
    assert data == {"collect_company": False, "require_company": False}


# QA-009
def _ics(**kw):
    return Calendar.from_ical(generate_booking_ics(
        booking_id=uuid.uuid4(), summary="s", description="d", starts_at=START, ends_at=END,
        host_name="H", host_email="h@example.com", visitor_name="V", visitor_email="v@example.com", **kw,
    ))


def test_ics_carries_uid_sequence_and_method():
    cal = _ics(uid="chain@timeiq.app", sequence=3, method="CANCEL")
    ev = cal.walk("VEVENT")[0]
    assert str(cal["method"]) == "CANCEL"
    assert str(ev["uid"]) == "chain@timeiq.app"
    assert int(ev["sequence"]) == 3
    assert str(ev["status"]) == "CANCELLED"
    req = _ics()
    assert str(req["method"]) == "REQUEST" and int(req.walk("VEVENT")[0]["sequence"]) == 0


def test_legacy_booking_uid_falls_back_to_its_id():
    bid = uuid.uuid4()
    assert ical_uid_for(NS(id=bid, ical_uid=None)) == f"{bid}@timeiq.app"
    assert ical_uid_for(NS(id=bid, ical_uid="root@timeiq.app")) == "root@timeiq.app"


def _mail_objects():
    host = NS(name="Host", email="h@example.com", timezone="Not/AZone", username="host")
    et = NS(name="Call", slug="call", duration_minutes=30, location=None)
    booking = NS(
        id=uuid.uuid4(), ical_uid="root@timeiq.app", ical_sequence=2, starts_at=START, ends_at=END,
        visitor_name="V", visitor_email="v@example.com", timezone="Asia/Tokyo", cancel_token="t",
        visitor_phone=None, visitor_company=None, visitor_url=None, visitor_notes=None,
    )
    return booking, et, host


async def test_cancellation_mail_cancels_the_invite_for_both_sides(monkeypatch):
    sent = []
    monkeypatch.setattr(E.resend.Emails, "send", lambda p: sent.append(p))
    booking, et, host = _mail_objects()
    await E.send_cancellation_notice(booking, et, host)  # host zone is invalid: must not raise
    assert len(sent) == 2
    for mail in sent:
        (att,) = mail["attachments"]
        assert att["content_type"] == "text/calendar; method=CANCEL"
        cal = Calendar.from_ical(att["content"])
        ev = cal.walk("VEVENT")[0]
        assert str(cal["method"]) == "CANCEL"
        assert str(ev["uid"]) == "root@timeiq.app" and int(ev["sequence"]) == 2


async def test_confirmation_invite_uses_chain_uid(monkeypatch):
    sent = []
    monkeypatch.setattr(E.resend.Emails, "send", lambda p: sent.append(p))
    booking, et, host = _mail_objects()
    await E.send_booking_confirmation(booking, et, host)
    ev = Calendar.from_ical(sent[0]["attachments"][0]["content"]).walk("VEVENT")[0]
    assert str(ev["uid"]) == "root@timeiq.app" and int(ev["sequence"]) == 2
