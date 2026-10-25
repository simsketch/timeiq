from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CalendarSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    ics_url: str = Field(..., min_length=1)
    calendar_type: Optional[str] = Field(default="ics")


class CalendarSourceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    ics_url: Optional[str] = Field(default=None, min_length=1)


class CalendarSourceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    name: str
    google_calendar_id: Optional[str]
    ics_url: Optional[str]
    is_active: bool
    last_synced_at: Optional[datetime]
    sync_status: str = "ok"
    last_sync_error: Optional[str] = None
    last_sync_attempt_at: Optional[datetime] = None
    failing_since: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CachedEventResponse(BaseModel):
    id: uuid.UUID
    calendar_source_id: uuid.UUID
    title: Optional[str]
    starts_at: datetime
    ends_at: datetime
    is_all_day: bool
    source_name: Optional[str] = None

    model_config = {"from_attributes": True}
