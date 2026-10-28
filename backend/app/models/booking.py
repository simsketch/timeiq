from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
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
        ForeignKey("timeiq.event_types.id"),
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
    # Payment terms survive event type edits and travel with a reschedule.
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="usd", server_default="usd")
    stripe_connect_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_checkout_session_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_refund_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refund_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    payment_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    payment_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    rescheduled_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    # Calendar invite identity, shared by every booking in a reschedule chain so
    # calendar clients update one event. Null on legacy rows: see ical_uid_for().
    ical_uid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ical_sequence: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
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
