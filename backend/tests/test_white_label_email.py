"""Guest-facing mail carries the host's brand; host and account mail stays TimeIQ."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

from app.services import email as E
from app.services import email_templates as t
from tests.test_invoice_pdf import _invoice

START = datetime(2026, 12, 1, 15, tzinfo=timezone.utc)
SENDER = "<bookings@timeiq.app>"


def host(white_label=False, **kw):
    return NS(**{"id": uuid.uuid4(), "name": "Dana Lee", "email": "dana@example.com", "timezone": "America/New_York",
                 "username": "dana", "booking_white_label": white_label, "booking_logo": None, **kw})


def objects():
    et = NS(name="Intro call", slug="intro", duration_minutes=30, location=None)
    booking = NS(
        id=uuid.uuid4(), ical_uid=None, ical_sequence=0, starts_at=START, ends_at=START + timedelta(minutes=30),
        visitor_name="Vee", visitor_email="v@example.com", timezone="Asia/Tokyo", cancel_token="t",
        visitor_phone=None, visitor_company=None, visitor_url=None, visitor_notes=None,
    )
    return booking, et


@pytest.fixture
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(E.resend.Emails, "send", lambda p, **kw: out.append(p))
    return out


@pytest.mark.parametrize("name,expected", [
    ("Dana Lee", "Dana Lee"),
    ("Dana\r\nBcc: x@evil.test", "Dana Bcc: x@evil.test"),
    ("<Dana>  \"Lee\"", "Dana Lee"),
    ("x" * 80, "x" * 60),
    ("   ", "dana"),  # blank name falls back to the email local-part
])
def test_host_display_sanitizes(name, expected):
    assert E._host_display(host(name=name)) == expected


def test_guest_from_variants():
    assert E.guest_from(host()) == f"Dana Lee via TimeIQ {SENDER}"
    assert E.guest_from(host(True)) == f"Dana Lee {SENDER}"
    assert E.guest_from(host(True, name="Lee, Dana")) == f'"Lee, Dana" {SENDER}'
    assert E.guest_from(host(True, name="Dana\n<x@evil.test>")) == f'"Dana x@evil.test" {SENDER}'
    assert E.guest_from(host(True, name=None, email="")) == f"TimeIQ {SENDER}"
    assert "\n" not in E.guest_from(host(name="a\r\nb"))


def test_layout_with_brand_drops_timeiq():
    html = t.layout("confirmed", "pre", t.h1("Hi"), brand=t.Brand("Dana Lee"))
    assert "TimeIQ" not in html and "hero-" not in html and "<img" not in html
    assert "<title>Dana Lee</title>" in html and "Dana Lee</div>" in html
    logo = t.layout("confirmed", "pre", "", brand=t.Brand("D", "https://cdn.example/l.png"))
    assert 'src="https://cdn.example/l.png"' in logo


def test_layout_without_brand_unchanged():
    html = t.layout("confirmed", "pre", t.h1("Hi"))
    assert "hero-confirmed.png" in html and "<title>TimeIQ</title>" in html
    assert "Forward any schedule. Find a time with anyone." in html and "/privacy" in html


def test_data_url_logo_falls_back_to_name():
    brand = E.guest_brand(host(True, booking_logo="data:image/png;base64,AAAA"))
    assert brand == t.Brand("Dana Lee", None)
    assert E.guest_brand(host(False, booking_logo="https://x.test/a.png")) is None


@pytest.mark.parametrize("wl", [False, True])
async def test_confirmation_and_cancellation(sent, wl):
    booking, et = objects()
    h = host(wl)
    await E.send_booking_confirmation(booking, et, h)
    await E.send_cancellation_notice(booking, et, h)
    guest_mail = [m for m in sent if m["to"] == ["v@example.com"]]
    host_mail = [m for m in sent if m["to"] == ["dana@example.com"]]
    assert len(guest_mail) == 2 and len(host_mail) == 2
    for m in guest_mail:
        assert m["from"] == E.guest_from(h)
        assert ("TimeIQ" not in m["html"]) is wl and ("hero-" not in m["html"]) is wl
    for m in host_mail:
        assert m["from"] == E.FROM_EMAIL and "hero-" in m["html"]
    confirm = guest_mail[0]["html"]
    if wl:
        assert "Reply to this email to reschedule or cancel." in confirm
    else:
        assert "Reply to this email to ask TimeIQ to reschedule or cancel your booking." in confirm


@pytest.mark.parametrize("wl", [False, True])
async def test_reminder(sent, wl):
    booking, et = objects()
    h = host(wl)
    await E.send_booking_reminder(booking, et, h, 60, "guest")
    await E.send_booking_reminder(booking, et, h, 60, "host")
    assert sent[0]["from"] == E.guest_from(h) and ("TimeIQ" not in sent[0]["html"]) is wl
    assert sent[1]["from"] == E.FROM_EMAIL and "hero-reminder.png" in sent[1]["html"]


@pytest.mark.parametrize("wl", [False, True])
@pytest.mark.parametrize("reminder", [None, 7])
def test_invoice(sent, wl, reminder):
    h = host(wl)
    E.send_invoice(_invoice(), b"%PDF", h, "https://x.test/i", reminder_days=reminder)
    E.send_invoice_copy(_invoice(), b"%PDF", h, "https://x.test/i")
    client, copy = sent
    assert client["from"] == E.guest_from(h) and ("TimeIQ" not in client["html"]) is wl
    assert copy["from"] == E.FROM_EMAIL and "hero-invoice.png" in copy["html"]  # sender's own copy


def test_account_mail_unchanged(sent):
    E.send_welcome(host(True))
    assert sent[0]["from"] != E.guest_from(host(True)) and "hero-welcome.png" in sent[0]["html"]
