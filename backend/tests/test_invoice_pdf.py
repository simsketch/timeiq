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
