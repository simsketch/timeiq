from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class BookingCreate(BaseModel):
    visitor_name: str = Field(..., min_length=1, max_length=255)
    visitor_email: EmailStr
    visitor_notes: Optional[str] = None
    starts_at: datetime
    timezone: str = Field(..., min_length=1, max_length=100)


class BookingResponse(BaseModel):
    id: uuid.UUID
    event_type_id: uuid.UUID
    host_user_id: uuid.UUID
    visitor_name: str
    visitor_email: str
    visitor_notes: Optional[str]
    starts_at: datetime
    ends_at: datetime
    timezone: str
    status: str
    cancel_token: Optional[str] = None
    cancelled_at: Optional[datetime]
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
