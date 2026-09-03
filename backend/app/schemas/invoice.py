from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class InvoiceCreate(BaseModel):
    client_id: uuid.UUID
    period_start: date
    period_end: date
    notes: Optional[str] = None

    @model_validator(mode="after")
    def check_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class InvoiceUpdate(BaseModel):
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class InvoicePreview(BaseModel):
    entry_count: int
    total_hours: Decimal
    subtotal: Decimal
    currency: str


class InvoiceLineResponse(BaseModel):
    id: uuid.UUID
    time_entry_id: Optional[uuid.UUID] = None
    line_date: date
    description: str
    hours: Decimal
    rate: Decimal
    amount: Decimal

    model_config = {"from_attributes": True}


class InvoiceSummary(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    number: str
    status: str
    issue_date: date
    due_date: date
    period_start: date
    period_end: date
    currency: str
    subtotal: Decimal
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceResponse(InvoiceSummary):
    hourly_rate: Decimal
    client_contact_name: Optional[str] = None
    client_billing_email: Optional[str] = None
    client_address: Optional[str] = None
    notes: Optional[str] = None
    public_token: str
    lines: list[InvoiceLineResponse] = Field(default_factory=list)


class PublicInvoiceResponse(BaseModel):
    number: str
    status: str
    issue_date: date
    due_date: date
    period_start: date
    period_end: date
    currency: str
    hourly_rate: Decimal
    subtotal: Decimal
    client_name: str
    client_contact_name: Optional[str] = None
    client_billing_email: Optional[str] = None
    client_address: Optional[str] = None
    notes: Optional[str] = None
    sender_name: str
    sender_email: str
    lines: list[InvoiceLineResponse]
