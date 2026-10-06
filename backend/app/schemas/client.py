from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.services.invoicing import normalize_email_list


class _BillingEmails(BaseModel):
    @field_validator("billing_email", mode="before", check_fields=False)
    @classmethod
    def _emails(cls, v):
        # One or more addresses, sent as "a, b" or a list; stored as "a, b".
        return normalize_email_list(v)


class ClientCreate(_BillingEmails):
    name: str = Field(..., min_length=1, max_length=255)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    billing_email: Optional[str] = None
    address: Optional[str] = None
    hourly_rate: Decimal = Field(..., ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    match_keywords: Optional[str] = None
    auto_invoice_monthly: bool = False


class ClientUpdate(_BillingEmails):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    billing_email: Optional[str] = None
    address: Optional[str] = None
    hourly_rate: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    payment_terms_days: Optional[int] = Field(default=None, ge=0, le=365)
    match_keywords: Optional[str] = None
    auto_invoice_monthly: Optional[bool] = None


class ClientResponse(BaseModel):
    id: uuid.UUID
    name: str
    contact_name: Optional[str] = None
    billing_email: Optional[str] = None
    address: Optional[str] = None
    hourly_rate: Decimal
    currency: str
    payment_terms_days: int
    match_keywords: Optional[str] = None
    auto_invoice_monthly: bool = False
    unbilled_hours: Decimal = Decimal("0")
    unbilled_amount: Decimal = Decimal("0")
    created_at: datetime

    model_config = {"from_attributes": True}
