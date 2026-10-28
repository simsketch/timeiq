from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

INTAKE_FIELDS = ("phone", "company", "url")


class EventTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    location: Optional[str] = Field(default=None, max_length=500)
    duration_minutes: int = Field(..., ge=5, le=480, alias="duration")
    color: str = Field(default="#3B82F6", max_length=20)
    is_active: bool = True
    buffer_minutes: int = Field(default=0, ge=0, le=120, alias="buffer_time")
    max_bookings_per_day: Optional[int] = Field(default=None, ge=1)
    min_notice_minutes: int = Field(default=0, ge=0, le=2880)
    max_days_ahead: Optional[int] = Field(default=None, ge=1, le=90)
    reminder_minutes: list[Literal[15, 60, 1440]] = Field(default_factory=lambda: [1440], max_length=3)
    remind_host: bool = False
    collect_phone: bool = False
    require_phone: bool = False
    collect_company: bool = False
    require_company: bool = False
    collect_url: bool = False
    require_url: bool = False

    model_config = {"populate_by_name": True}

    def intake_flags(self) -> dict[str, bool]:
        """The six intake flags, with require implying collect: the public form
        only shows collected fields, so a required hidden field can never be filled."""
        flags: dict[str, bool] = {}
        for f in INTAKE_FIELDS:
            require = getattr(self, f"require_{f}")
            flags[f"collect_{f}"] = getattr(self, f"collect_{f}") or require
            flags[f"require_{f}"] = require
        return flags


# Fields the database requires; an explicit null for any of them is a 422.
NON_NULLABLE_UPDATE_FIELDS = (
    "name", "slug", "duration_minutes", "color", "is_active", "buffer_minutes",
    "min_notice_minutes", "reminder_minutes", "remind_host",
    *(f"{kind}_{f}" for f in INTAKE_FIELDS for kind in ("collect", "require")),
)


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
    min_notice_minutes: Optional[int] = Field(default=None, ge=0, le=2880)
    max_days_ahead: Optional[int] = Field(default=None, ge=1, le=90)
    reminder_minutes: Optional[list[Literal[15, 60, 1440]]] = Field(default=None, max_length=3)
    remind_host: Optional[bool] = None
    collect_phone: Optional[bool] = None
    require_phone: Optional[bool] = None
    collect_company: Optional[bool] = None
    require_company: Optional[bool] = None
    collect_url: Optional[bool] = None
    require_url: Optional[bool] = None

    model_config = {"populate_by_name": True}

    @field_validator(*NON_NULLABLE_UPDATE_FIELDS)
    @classmethod
    def _not_null(cls, value):
        if value is None:
            raise ValueError("may be omitted but not null")
        return value


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
    min_notice_minutes: int = 0
    max_days_ahead: Optional[int] = None
    reminder_minutes: list[int] = Field(default_factory=lambda: [1440])
    remind_host: bool = False
    collect_phone: bool = False
    require_phone: bool = False
    collect_company: bool = False
    require_company: bool = False
    collect_url: bool = False
    require_url: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
