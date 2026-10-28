from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventType(Base):
    __tablename__ = "event_types"
    __table_args__ = (
        UniqueConstraint("user_id", "slug", name="uq_event_types_user_id_slug"),
        {"schema": "timeiq"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("timeiq.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#3B82F6"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    buffer_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    max_bookings_per_day: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    min_notice_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    max_days_ahead: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reminder_minutes: Mapped[list[int]] = mapped_column(
        JSONB, nullable=False, default=lambda: [1440], server_default="[1440]"
    )
    remind_host: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    collect_phone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    require_phone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    collect_company: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    require_company: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    collect_url: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    require_url: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set instead of deleting when the event type has bookings, so their history survives.
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="event_types")
    # Bookings outlive their event type: never cascade, never null the FK.
    bookings = relationship(
        "Booking", back_populates="event_type", passive_deletes="all"
    )
