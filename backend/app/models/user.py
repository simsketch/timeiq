from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    clerk_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    timezone: Mapped[str] = mapped_column(
        String(100), nullable=False, default="America/New_York"
    )
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    feed_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True
    )
    feed_obfuscate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    next_invoice_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    # Billing
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    subscription_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="none", server_default="none"
    )
    subscription_plan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    subscription_current_period_end: Mapped[datetime | None] = mapped_column(
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
    calendar_sources = relationship(
        "CalendarSource", back_populates="user", cascade="all, delete-orphan"
    )
    cached_events = relationship(
        "CachedEvent", back_populates="user", cascade="all, delete-orphan"
    )
    event_types = relationship(
        "EventType", back_populates="user", cascade="all, delete-orphan"
    )
    availability_rules = relationship(
        "AvailabilityRule", back_populates="user", cascade="all, delete-orphan"
    )
    bookings = relationship(
        "Booking",
        back_populates="host",
        cascade="all, delete-orphan",
        foreign_keys="Booking.host_user_id",
    )
    clients = relationship(
        "Client", back_populates="user", cascade="all, delete-orphan"
    )
    invoices = relationship(
        "Invoice", back_populates="user", cascade="all, delete-orphan"
    )
