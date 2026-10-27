from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Calendars TimeIQ fills itself (emailed schedules, booked group meetings).
# They have no feed, so sync and health checks skip them.
LOCAL_SOURCE_TYPES = ("email", "meetings")


class CalendarSource(Base):
    __tablename__ = "calendar_sources"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("timeiq.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'google' or 'ics_url'
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    google_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    google_calendar_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    ics_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Sync health, managed by app.services.calendar_health:
    # 'ok', 'failing' (retrying with backoff) or 'broken' (owner emailed, daily retry).
    sync_status: Mapped[str] = mapped_column(String(10), nullable=False, default="ok", server_default="ok")
    sync_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    failing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    broken_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="calendar_sources")
    cached_events = relationship(
        "CachedEvent", back_populates="calendar_source", cascade="all, delete-orphan"
    )
