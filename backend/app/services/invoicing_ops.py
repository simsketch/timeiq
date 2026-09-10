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

    subtotal = Decimal("0")
    for entry in entries:
        amount = line_amount(entry.hours, client.hourly_rate)
        subtotal += amount
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                time_entry_id=entry.id,
                line_date=entry.entry_date,
                description=entry.description,
                hours=entry.hours,
                rate=client.hourly_rate,
                amount=amount,
            )
        )
        entry.invoice_id = invoice.id
    invoice.subtotal = subtotal
    await db.flush()
    return invoice


def previous_month(today: date) -> tuple[date, date]:
    first_this = today.replace(day=1)
    end = first_this - timedelta(days=1)
    return end.replace(day=1), end
