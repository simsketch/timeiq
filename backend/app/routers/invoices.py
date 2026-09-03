from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.invoice import Invoice, InvoiceLine
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.routers.clients import get_owned_client
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceLineResponse,
    InvoicePreview,
    InvoiceResponse,
    InvoiceSummary,
    InvoiceUpdate,
    PublicInvoiceResponse,
)
from app.services.email import send_invoice
from app.services.invoice_pdf import build_invoice_pdf
from app.services.invoicing import format_invoice_number, line_amount

router = APIRouter(tags=["invoices"])

# Token-addressed, unauthenticated routes. Registered in main.py ahead of the
# generic public router so its /{username}/{event_slug} route can't shadow these.
public_router = APIRouter(prefix="/api/public/invoices", tags=["public"])


async def get_owned_invoice(
    db: AsyncSession, user: User, invoice_id: uuid.UUID
) -> Invoice:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.id == invoice_id, Invoice.user_id == user.id)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    return invoice


def require_status(invoice: Invoice, *allowed: str) -> None:
    if invoice.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice is {invoice.status}; action requires {' or '.join(allowed)}",
        )


async def unbilled_entries(
    db: AsyncSession, user: User, client_id: uuid.UUID, start: date, end: date
) -> list[TimeEntry]:
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


async def release_entries(db: AsyncSession, invoice: Invoice) -> None:
    """Make the invoice's entries unbilled again."""
    await db.execute(
        update(TimeEntry)
        .where(TimeEntry.invoice_id == invoice.id)
        .values(invoice_id=None)
    )


def pdf_response(invoice: Invoice, user: User, disposition: str) -> Response:
    pdf = build_invoice_pdf(invoice, user.name or user.email, user.email)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{invoice.number}.pdf"'
        },
    )


# /preview is declared before /{invoice_id} so it matches first.


@router.get("/api/invoices/preview", response_model=InvoicePreview)
async def preview_invoice(
    client_id: uuid.UUID = Query(...),
    period_start: date = Query(...),
    period_end: date = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_owned_client(db, user, client_id)
    entries = await unbilled_entries(db, user, client_id, period_start, period_end)
    hours = sum((Decimal(e.hours) for e in entries), Decimal("0"))
    subtotal = sum(
        (line_amount(e.hours, client.hourly_rate) for e in entries), Decimal("0")
    )
    return InvoicePreview(
        entry_count=len(entries),
        total_hours=hours,
        subtotal=subtotal,
        currency=client.currency,
    )


@router.post(
    "/api/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED
)
async def create_invoice(
    data: InvoiceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_owned_client(db, user, data.client_id)
    entries = await unbilled_entries(
        db, user, client.id, data.period_start, data.period_end
    )
    if not entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No unbilled time entries in that period",
        )

    today = datetime.now(timezone.utc).date()
    invoice = Invoice(
        user_id=user.id,
        client_id=client.id,
        number=format_invoice_number(user.next_invoice_number),
        status="draft",
        issue_date=today,
        due_date=today + timedelta(days=client.payment_terms_days),
        period_start=data.period_start,
        period_end=data.period_end,
        currency=client.currency,
        hourly_rate=client.hourly_rate,
        client_name=client.name,
        client_contact_name=client.contact_name,
        client_billing_email=client.billing_email,
        client_address=client.address,
        notes=data.notes,
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
    db.expire(invoice, ["lines"])
    return await get_owned_invoice(db, user, invoice.id)


@router.get("/api/invoices", response_model=list[InvoiceSummary])
async def list_invoices(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Invoice)
        .where(Invoice.user_id == user.id)
        .order_by(Invoice.created_at.desc())
    )
    return result.scalars().all()


@router.get("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_owned_invoice(db, user, invoice_id)


@router.patch("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: uuid.UUID,
    data: InvoiceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(invoice, key, value)
    if invoice.due_date < invoice.issue_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Due date is before issue date",
        )
    await db.flush()
    return invoice


@router.post("/api/invoices/{invoice_id}/send", response_model=InvoiceResponse)
async def send_invoice_route(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft", "sent")
    if not invoice.client_billing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Client has no billing email. Add one to the client, "
                "then void and recreate this invoice."
            ),
        )
    pdf = build_invoice_pdf(invoice, user.name or user.email, user.email)
    hosted_url = f"{settings.FRONTEND_URL}/invoice/{invoice.public_token}"
    try:
        send_invoice(invoice, pdf, user, hosted_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    invoice.status = "sent"
    invoice.sent_at = datetime.now(timezone.utc)
    await db.flush()
    return invoice


@router.post("/api/invoices/{invoice_id}/mark-paid", response_model=InvoiceResponse)
async def mark_paid(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "sent")
    invoice.status = "paid"
    invoice.paid_at = datetime.now(timezone.utc)
    await db.flush()
    return invoice


@router.post("/api/invoices/{invoice_id}/void", response_model=InvoiceResponse)
async def void_invoice(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft", "sent")
    await release_entries(db, invoice)
    invoice.status = "void"
    await db.flush()
    return invoice


@router.delete("/api/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft")
    await release_entries(db, invoice)
    await db.delete(invoice)
    await db.flush()


@router.get("/api/invoices/{invoice_id}/pdf")
async def download_pdf(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    return pdf_response(invoice, user, "attachment")


async def _public_invoice(token: str, db: AsyncSession) -> tuple[Invoice, User]:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines), selectinload(Invoice.user))
        .where(Invoice.public_token == token)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None or invoice.status == "void":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    return invoice, invoice.user


@public_router.get("/{token}", response_model=PublicInvoiceResponse)
async def public_invoice(token: str, db: AsyncSession = Depends(get_db)):
    invoice, sender = await _public_invoice(token, db)
    return PublicInvoiceResponse(
        number=invoice.number,
        status=invoice.status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        period_start=invoice.period_start,
        period_end=invoice.period_end,
        currency=invoice.currency,
        hourly_rate=invoice.hourly_rate,
        subtotal=invoice.subtotal,
        client_name=invoice.client_name,
        client_contact_name=invoice.client_contact_name,
        client_billing_email=invoice.client_billing_email,
        client_address=invoice.client_address,
        notes=invoice.notes,
        sender_name=sender.name or sender.email,
        sender_email=sender.email,
        lines=[InvoiceLineResponse.model_validate(l) for l in invoice.lines],
    )


@public_router.get("/{token}/pdf")
async def public_invoice_pdf(token: str, db: AsyncSession = Depends(get_db)):
    invoice, sender = await _public_invoice(token, db)
    return pdf_response(invoice, sender, "inline")
