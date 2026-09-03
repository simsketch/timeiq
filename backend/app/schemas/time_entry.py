from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class TimeEntryCreate(BaseModel):
    client_id: uuid.UUID
    entry_date: date
    hours: Decimal = Field(..., gt=0, le=24, decimal_places=2)
    description: str = Field(..., min_length=1)


class TimeEntryBulkCreate(BaseModel):
    entries: list[TimeEntryCreate] = Field(..., min_length=1, max_length=200)


class TimeEntryUpdate(BaseModel):
    client_id: Optional[uuid.UUID] = None
    entry_date: Optional[date] = None
    hours: Optional[Decimal] = Field(default=None, gt=0, le=24, decimal_places=2)
    description: Optional[str] = Field(default=None, min_length=1)


class TimeEntryResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    entry_date: date
    hours: Decimal
    description: str
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UnbilledSummary(BaseModel):
    client_id: uuid.UUID
    client_name: str
    currency: str
    unbilled_hours: Decimal
    unbilled_amount: Decimal


class SuggestRequest(BaseModel):
    client_id: uuid.UUID
    start: date
    end: date


class SuggestedEntry(BaseModel):
    external_id: Optional[str] = None
    title: str
    entry_date: date
    hours: Decimal
    starts_at: datetime
    ends_at: datetime
