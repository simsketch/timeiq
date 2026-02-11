from __future__ import annotations

import uuid
from datetime import time
from typing import Optional

from pydantic import BaseModel, Field


class AvailabilityRuleCreate(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time
    is_active: bool = True


class AvailabilityRuleResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool

    model_config = {"from_attributes": True}


class AvailabilityRuleBulkUpdate(BaseModel):
    rules: list[AvailabilityRuleCreate]


class AvailableSlot(BaseModel):
    start: str  # ISO 8601 datetime string
