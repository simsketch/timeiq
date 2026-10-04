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
from app.services.invoice_grouping import (
    group_time_lines,
    split_lines,
    totals,
    weekly_breakdown,
)
from reportlab.platypus import (
    KeepTogether,
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

    time_lines, expense_lines = split_lines(invoice.lines)
    grouped = group_time_lines(invoice.lines)
    weeks = weekly_breakdown(invoice.lines)
    sums = totals(invoice.lines)
    cur = invoice.currency

    def styled(rows: list[list], widths: list[float], total_row: bool = True) -> Table:
        t = Table(rows, colWidths=widths, repeatRows=1)
        st = [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("LINEBELOW", (0, 0), (-1, -2 if total_row else -1), 0.25, RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]
        if total_row:
            st += [
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
            ]
        last = len(rows) - 1 if total_row else len(rows)
        for i in range(1, last):
            if i % 2 == 0:
                st.append(("BACKGROUND", (0, i), (-1, i), STRIPE))
        t.setStyle(TableStyle(st))
        return t

    def span(first, last) -> str:
        """Compact range; the period line above already carries the year."""
        if first == last:
            return first.strftime("%b %-d")
        if first.year != last.year:
            return f"{fmt_date(first)} - {fmt_date(last)}"
        if first.month == last.month:
            return f"{first.strftime('%b %-d')} - {last.strftime('%-d')}"
        return f"{first.strftime('%b %-d')} - {last.strftime('%b %-d')}"

    story = [header, Spacer(1, 18), meta, Spacer(1, 18)]

    # Services, one row per distinct description rather than per day.
    if grouped:
        rows: list[list] = [["Description", "Dates", "Hours", "Rate", "Amount"]]
        for g in grouped:
            rows.append(
                [
                    _p(g.description, body),
                    span(g.first_date, g.last_date),
                    f"{g.hours:.2f}",
                    f"{g.rate:,.2f}",
                    f"{g.amount:,.2f}",
                ]
            )
        rows.append(
            ["Services subtotal", "", f"{sums['hours']:.2f}", "", f"{sums['time_amount']:,.2f}"]
        )
        story += [
            styled(rows, [3.3 * inch, 1.1 * inch, 0.6 * inch, 0.8 * inch, 1.1 * inch]),
            Spacer(1, 16),
        ]

    # An hours-only summary of the lines above. No money column, so it can't
    # read as a second set of charges.
    if getattr(invoice, "show_weekly_breakdown", True) and len(weeks) > 1:
        wrows: list[list] = [["Week", "Hours"]]
        for w in weeks:
            wrows.append([span(w.week_start, w.week_end), f"{w.hours:.2f}"])
        wrows.append(["Total hours", f"{sums['hours']:.2f}"])
        story.append(
            KeepTogether(
                [
                    _p("HOURS BY WEEK", label),
                    Spacer(1, 2),
                    _p(
                        "A summary of the hours billed above, not an additional charge.",
                        small,
                    ),
                    Spacer(1, 6),
                    styled(wrows, [3.4 * inch, 3.5 * inch]),
                ]
            )
        )
        story.append(Spacer(1, 16))

    if expense_lines:
        erows: list[list] = [["Expense", "Date", "Amount"]]
        for e in expense_lines:
            erows.append([_p(e.description, body), fmt_date(e.line_date), f"{Decimal(e.amount):,.2f}"])
        erows.append(["Expenses subtotal", "", f"{sums['expense_amount']:,.2f}"])
        story.append(
            KeepTogether(
                [
                    _p("EXPENSES", label),
                    Spacer(1, 6),
                    styled(erows, [4.5 * inch, 1.3 * inch, 1.1 * inch]),
                ]
            )
        )
        story.append(Spacer(1, 16))

    total_tbl = Table(
        [["TOTAL DUE", fmt_money(invoice.subtotal, cur)]],
        colWidths=[5.6 * inch, 1.3 * inch],
    )
    total_tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 12),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LINEABOVE", (0, 0), (-1, 0), 1.5, INK),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story += [total_tbl, Spacer(1, 18)]
    story.append(_p(f"Payment due within {terms_days} days of the issue date.", small))
    if invoice.notes:
        story += [Spacer(1, 10), _p("NOTES", label), _p(invoice.notes, body)]

    doc.build(story)
    return buf.getvalue()
