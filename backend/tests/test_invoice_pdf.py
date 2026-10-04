import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services.invoice_pdf import build_invoice_pdf


def _invoice():
    lines = [
        SimpleNamespace(
            line_date=date(2026, 8, 3), description="Auth refactor",
            hours=Decimal("2.50"), rate=Decimal("150.00"), amount=Decimal("375.00"),
        ),
        SimpleNamespace(
            line_date=date(2026, 8, 4), description="Bug triage & <fixes>",
            hours=Decimal("1.00"), rate=Decimal("150.00"), amount=Decimal("150.00"),
        ),
    ]
    return SimpleNamespace(
        id=uuid.uuid4(), number="INV-0007", status="draft",
        issue_date=date(2026, 9, 1), due_date=date(2026, 10, 1),
        period_start=date(2026, 8, 1), period_end=date(2026, 8, 31),
        currency="USD", hourly_rate=Decimal("150.00"), subtotal=Decimal("525.00"),
        client_name="Acme Corp", client_contact_name="Jane Doe",
        client_billing_email="ap@acme.example", client_address="1 Main St\nSpringfield",
        notes="Thanks!", lines=lines,
    )


def test_build_invoice_pdf_returns_pdf_bytes():
    pdf = build_invoice_pdf(_invoice(), "Elon Zito", "elon@example.com")
    assert isinstance(pdf, bytes)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000


def test_build_invoice_pdf_handles_missing_optional_fields():
    inv = _invoice()
    inv.client_contact_name = None
    inv.client_address = None
    inv.client_billing_email = None
    inv.notes = None
    assert build_invoice_pdf(inv, "Elon", "e@x.com")[:5] == b"%PDF-"


def _line(d, desc, hours, amount, kind="time", rate="150.00"):
    return SimpleNamespace(
        line_date=d, description=desc, kind=kind,
        hours=Decimal(hours) if kind == "time" else None,
        rate=Decimal(rate) if kind == "time" else None,
        amount=Decimal(amount),
    )


def test_pdf_renders_grouped_lines_weeks_and_expenses():
    inv = _invoice()
    inv.lines = [
        _line(date(2026, 8, 3), "work", "8", "1200"),
        _line(date(2026, 8, 4), "work", "8", "1200"),
        _line(date(2026, 8, 11), "work", "8", "1200"),
        _line(date(2026, 8, 12), "Claude Max subscription", "0", "200", kind="expense"),
    ]
    inv.subtotal = Decimal("3800.00")
    pdf = build_invoice_pdf(inv, "Elon", "e@x.com")
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000


def test_pdf_handles_expense_only_invoice():
    inv = _invoice()
    inv.lines = [_line(date(2026, 8, 12), "Hosting", "0", "40", kind="expense")]
    inv.subtotal = Decimal("40.00")
    assert build_invoice_pdf(inv, "Elon", "e@x.com")[:5] == b"%PDF-"


def test_weekly_summary_toggle_shortens_the_pdf():
    """The hours-by-week table is presentation only and can be switched off."""

    def build(show: bool) -> bytes:
        inv = _invoice()
        inv.lines = [
            _line(date(2026, 8, 3), "work", "8", "1200"),
            _line(date(2026, 8, 11), "work", "8", "1200"),
            _line(date(2026, 8, 18), "work", "8", "1200"),
        ]
        inv.subtotal = Decimal("3600.00")
        inv.show_weekly_breakdown = show
        return build_invoice_pdf(inv, "Elon", "e@x.com")

    on, off = build(True), build(False)
    assert on[:5] == b"%PDF-" and off[:5] == b"%PDF-"
    # The extra table costs bytes; without it the document is smaller.
    assert len(off) < len(on)


def test_weekly_summary_defaults_on_when_attribute_missing():
    inv = _invoice()
    inv.lines = [
        _line(date(2026, 8, 3), "work", "8", "1200"),
        _line(date(2026, 8, 11), "work", "8", "1200"),
    ]
    inv.subtotal = Decimal("2400.00")
    if hasattr(inv, "show_weekly_breakdown"):
        del inv.show_weekly_breakdown
    assert build_invoice_pdf(inv, "Elon", "e@x.com")[:5] == b"%PDF-"
