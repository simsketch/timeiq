from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

INK = colors.HexColor("#1f2937")
RULE = colors.HexColor("#e5e7eb")
STRIPE = colors.HexColor("#f9fafb")
MUTED = colors.HexColor("#555555")


def fmt_money(amount: Decimal, currency: str) -> str:
    return f"{currency} {Decimal(amount):,.2f}"


def fmt_date(d: date) -> str:
    return d.strftime("%b %d, %Y")


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def build_invoice_pdf(invoice, sender_name: str, sender_email: str) -> bytes:
    """Render an invoice (with .lines) to PDF bytes."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.8 * inch,
        rightMargin=0.8 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        title=invoice.number,
        author=sender_name,
    )
    ss = getSampleStyleSheet()
    body = ss["BodyText"]
    small = ParagraphStyle("small", parent=body, fontSize=9, leading=12, textColor=MUTED)
    right = ParagraphStyle("right", parent=body, alignment=TA_RIGHT)
    h1 = ParagraphStyle("h1", parent=ss["Title"], alignment=TA_RIGHT, fontSize=22, leading=26)
    label = ParagraphStyle("label", parent=small, fontName="Helvetica-Bold")

    terms_days = (invoice.due_date - invoice.issue_date).days

    header = Table(
        [
            [
                [_p(sender_name, ss["Heading3"]), _p(sender_email, small)],
                [
                    _p("INVOICE", h1),
                    _p(invoice.number, right),
                    _p(f"Issued {fmt_date(invoice.issue_date)}", right),
                    _p(f"Due {fmt_date(invoice.due_date)}", right),
                ],
            ]
        ],
        colWidths=[3.5 * inch, 3.4 * inch],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    bill_to = [_p("BILL TO", label), _p(invoice.client_name, body)]
    if invoice.client_contact_name:
        bill_to.append(_p(invoice.client_contact_name, body))
    if invoice.client_address:
        bill_to.append(_p(invoice.client_address, body))
    if invoice.client_billing_email:
        bill_to.append(_p(invoice.client_billing_email, small))
    period = [
        _p("PERIOD", label),
        _p(f"{fmt_date(invoice.period_start)} to {fmt_date(invoice.period_end)}", body),
        Spacer(1, 6),
        _p("RATE", label),
        _p(f"{fmt_money(invoice.hourly_rate, invoice.currency)} / hour", body),
    ]
    meta = Table([[bill_to, period]], colWidths=[3.5 * inch, 3.4 * inch])
    meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    rows: list[list] = [["Date", "Description", "Hours", "Rate", "Amount"]]
    for line in invoice.lines:
        rows.append(
            [
                fmt_date(line.line_date),
                _p(line.description, body),
                f"{Decimal(line.hours):.2f}",
                f"{Decimal(line.rate):,.2f}",
                f"{Decimal(line.amount):,.2f}",
            ]
        )
    total_hours = sum((Decimal(l.hours) for l in invoice.lines), Decimal("0"))
    rows.append(
        ["", "Total", f"{total_hours:.2f}", "", fmt_money(invoice.subtotal, invoice.currency)]
    )

    table = Table(
        rows,
        colWidths=[1.0 * inch, 3.3 * inch, 0.7 * inch, 0.9 * inch, 1.0 * inch],
        repeatRows=1,
    )
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, RULE),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(rows) - 1):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), STRIPE))
    table.setStyle(TableStyle(style))

    story = [header, Spacer(1, 18), meta, Spacer(1, 18), table, Spacer(1, 18)]
    story.append(_p(f"Payment due within {terms_days} days of the issue date.", small))
    if invoice.notes:
        story += [Spacer(1, 10), _p("NOTES", label), _p(invoice.notes, body)]

    doc.build(story)
    return buf.getvalue()
