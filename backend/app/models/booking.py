from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("timeiq.event_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    host_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("timeiq.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visitor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    visitor_email: Mapped[str] = mapped_column(String(320), nullable=False)
    visitor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    visitor_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    visitor_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visitor_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="confirmed"
    )
    cancel_token: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rescheduled_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    event_type = relationship("EventType", back_populates="bookings")
    host = relationship(
        "User", back_populates="bookings", foreign_keys=[host_user_id]
    )
