from datetime import datetime, timezone
from decimal import Decimal

from app.services.invoicing import (
    duration_to_hours,
    format_invoice_number,
    line_amount,
    parse_keywords,
    title_matches,
)


def test_line_amount_rounds_half_up_to_cents():
    assert line_amount(Decimal("1.25"), Decimal("150.00")) == Decimal("187.50")
    assert line_amount(Decimal("0.33"), Decimal("100.00")) == Decimal("33.00")
    assert line_amount(Decimal("1.005"), Decimal("1")) == Decimal("1.01")


def test_format_invoice_number_pads_to_four():
    assert format_invoice_number(1) == "INV-0001"
    assert format_invoice_number(12345) == "INV-12345"


def test_duration_to_hours_rounds_to_quarter_with_minimum():
    s = datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc)
    assert duration_to_hours(s, s.replace(hour=10)) == Decimal("1.00")
    assert duration_to_hours(s, s.replace(minute=50)) == Decimal("0.75")
    assert duration_to_hours(s, s.replace(minute=5)) == Decimal("0.25")
    assert duration_to_hours(s, s.replace(hour=10, minute=8)) == Decimal("1.25")


def test_parse_keywords_normalises():
    assert parse_keywords(" Acme, acme corp ,,ACME ") == ["acme", "acme corp"]
    assert parse_keywords(None) == []


def test_title_matches_is_case_insensitive_substring():
    kws = parse_keywords("acme, standup")
    assert title_matches("Weekly ACME sync", kws)
    assert title_matches("standup", kws)
    assert not title_matches("Dentist", kws)
    assert not title_matches(None, kws)
    assert not title_matches("anything", [])
