"""Invoice creation shared by the API route and the monthly cron."""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.invoice import Invoice, InvoiceLine
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.services.invoicing import format_invoice_number, line_amount


async def unbilled_entries(db: AsyncSession, user: User, client_id, start: date, end: date) -> list[TimeEntry]:
    result = await db.execute(
        select(TimeEntry)
        .where(
            TimeEntry.user_id == user.id,
            TimeEntry.client_id == client_id,
            TimeEntry.invoice_id.is_(None),
            TimeEntry.entry_date >= start,
            TimeEntry.entry_date <= end,
        )
        .order_by(TimeEntry.entry_date.asc(), TimeEntry.created_at.asc())
    )
    return list(result.scalars().all())


async def create_invoice_from_entries(
    db: AsyncSession, user: User, client: Client, entries: list[TimeEntry], start: date, end: date, notes: str | None = None
) -> Invoice:
    """Snapshot the client, number the invoice, copy entries into lines, and mark them billed.
    Caller must ensure `entries` is non-empty and flush/commit afterwards."""
    today = datetime.now(timezone.utc).date()
    invoice = Invoice(
        user_id=user.id,
        client_id=client.id,
        number=format_invoice_number(user.next_invoice_number),
        status="draft",
        issue_date=today,
        due_date=today + timedelta(days=client.payment_terms_days),
        period_start=start,
        period_end=end,
        currency=client.currency,
        hourly_rate=client.hourly_rate,
        client_name=client.name,
        client_contact_name=client.contact_name,
        client_billing_email=client.billing_email,
        client_address=client.address,
        notes=notes,
        public_token=secrets.token_urlsafe(32),
    )
    user.next_invoice_number += 1
    db.add(invoice)
    await db.flush()

    await attach_entries(db, invoice, entries)
    return invoice


async def attach_entries(db: AsyncSession, invoice: Invoice, entries: list[TimeEntry]) -> None:
    """Copy entries onto the invoice as time lines at its snapshotted rate, mark
    them billed, and retotal. Shared by new drafts and drafts picking up hours."""
    for entry in entries:
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                kind="time",
                time_entry_id=entry.id,
                line_date=entry.entry_date,
                description=entry.description,
                hours=entry.hours,
                rate=invoice.hourly_rate,
                amount=line_amount(entry.hours, invoice.hourly_rate),
            )
        )
        entry.invoice_id = invoice.id
    await db.flush()
    await recompute_subtotal(db, invoice)


async def draft_covering(db: AsyncSession, entry: TimeEntry) -> Invoice | None:
    """The newest draft for this entry's client whose period contains its date."""
    return (
        await db.execute(
            select(Invoice)
            .where(
                Invoice.user_id == entry.user_id,
                Invoice.client_id == entry.client_id,
                Invoice.status == "draft",
                Invoice.period_start <= entry.entry_date,
                Invoice.period_end >= entry.entry_date,
            )
            .order_by(Invoice.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def attach_to_open_draft(db: AsyncSession, entry: TimeEntry) -> Invoice | None:
    """Hours logged into a period that already has a draft belong on that draft.
    Sent and paid invoices are never touched."""
    if entry.invoice_id is not None:
        return None
    invoice = await draft_covering(db, entry)
    if invoice is not None:
        await attach_entries(db, invoice, [entry])
    return invoice


def previous_month(today: date) -> tuple[date, date]:
    first_this = today.replace(day=1)
    end = first_this - timedelta(days=1)
    return end.replace(day=1), end


async def recompute_subtotal(db: AsyncSession, invoice: Invoice) -> None:
    """Subtotal is time plus expenses; call after any line changes.

    The row lock serializes concurrent recomputes (the timesheet edits cells in
    parallel), so the last writer always sums every committed line."""
    from sqlalchemy import func

    await db.execute(select(Invoice.id).where(Invoice.id == invoice.id).with_for_update())

    total = (
        await db.execute(
            select(func.coalesce(func.sum(InvoiceLine.amount), 0)).where(
                InvoiceLine.invoice_id == invoice.id
            )
        )
    ).scalar_one()
    invoice.subtotal = Decimal(total)
    # Flush now, so a caller that expires the invoice can't discard the new total.
    await db.flush()


async def line_for_entry(db: AsyncSession, entry: TimeEntry) -> InvoiceLine | None:
    """The invoice line this entry was snapshotted into, if it is billed."""
    if entry.invoice_id is None:
        return None
    return (
        await db.execute(
            select(InvoiceLine).where(
                InvoiceLine.invoice_id == entry.invoice_id,
                InvoiceLine.time_entry_id == entry.id,
            )
        )
    ).scalar_one_or_none()


async def sync_line_from_entry(db: AsyncSession, entry: TimeEntry) -> Invoice | None:
    """Push an edited billed entry back onto its invoice line. Returns the invoice."""
    line = await line_for_entry(db, entry)
    if line is None:
        return None
    line.line_date = entry.entry_date
    line.description = entry.description
    line.hours = entry.hours
    line.amount = line_amount(entry.hours, line.rate or Decimal("0"))
    invoice = await db.get(Invoice, entry.invoice_id)
    if invoice is not None:
        await db.flush()
        await recompute_subtotal(db, invoice)
    return invoice


async def drop_line_for_entry(db: AsyncSession, entry: TimeEntry) -> Invoice | None:
    """Remove a billed entry's line from its invoice. Returns the invoice."""
    line = await line_for_entry(db, entry)
    invoice = await db.get(Invoice, entry.invoice_id) if entry.invoice_id else None
    if line is not None:
        await db.delete(line)
        await db.flush()
    if invoice is not None:
        await recompute_subtotal(db, invoice)
    return invoice
