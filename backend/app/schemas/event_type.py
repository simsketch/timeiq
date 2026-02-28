from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EventTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    location: Optional[str] = Field(default=None, max_length=500)
    duration_minutes: int = Field(..., ge=5, le=480, alias="duration")
    color: str = Field(default="#3B82F6", max_length=20)
    is_active: bool = True
    buffer_minutes: int = Field(default=0, ge=0, le=120, alias="buffer_time")
    max_bookings_per_day: Optional[int] = Field(default=None, ge=1)
    collect_phone: bool = False
    require_phone: bool = False
    collect_company: bool = False
    require_company: bool = False
    collect_url: bool = False
    require_url: bool = False

    model_config = {"populate_by_name": True}


class EventTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    location: Optional[str] = Field(default=None, max_length=500)
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=480, alias="duration")
    color: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None
    buffer_minutes: Optional[int] = Field(default=None, ge=0, le=120, alias="buffer_time")
    max_bookings_per_day: Optional[int] = Field(default=None, ge=1)
    collect_phone: Optional[bool] = None
    require_phone: Optional[bool] = None
    collect_company: Optional[bool] = None
    require_company: Optional[bool] = None
    collect_url: Optional[bool] = None
    require_url: Optional[bool] = None

    model_config = {"populate_by_name": True}


class EventTypeResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    slug: str
    name: str
    description: Optional[str]
    location: Optional[str]
    duration: int = Field(validation_alias="duration_minutes")
    color: str
    is_active: bool
    buffer_time: int = Field(validation_alias="buffer_minutes")
    max_bookings_per_day: Optional[int]
    collect_phone: bool = False
    require_phone: bool = False
    collect_company: bool = False
    require_company: bool = False
    collect_url: bool = False
    require_url: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
