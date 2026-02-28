from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class BookingCreate(BaseModel):
    visitor_name: str = Field(..., min_length=1, max_length=255)
    visitor_email: EmailStr
    visitor_notes: Optional[str] = None
    visitor_phone: Optional[str] = Field(default=None, max_length=50)
    visitor_company: Optional[str] = Field(default=None, max_length=255)
    visitor_url: Optional[str] = Field(default=None, max_length=500)
    starts_at: datetime
    timezone: str = Field(..., min_length=1, max_length=100)


class BookingResponse(BaseModel):
    id: uuid.UUID
    event_type_id: uuid.UUID
    host_user_id: uuid.UUID
    visitor_name: str
    visitor_email: str
    visitor_notes: Optional[str]
    visitor_phone: Optional[str] = None
    visitor_company: Optional[str] = None
    visitor_url: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    timezone: str
    status: str
    cancel_token: Optional[str] = None
    cancelled_at: Optional[datetime]
    rescheduled_from_id: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BookingPublicResponse(BaseModel):
    """Response for public booking endpoints -- hides cancel_token."""

    id: uuid.UUID
    event_type_id: uuid.UUID
    visitor_name: str
    visitor_email: str
    starts_at: datetime
    ends_at: datetime
    timezone: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
