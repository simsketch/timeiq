from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GroupMeeting(Base):
    """A meeting the organizer is finding a time for with several people
    (see services/group_meetings.py)."""

    __tablename__ = "group_meetings"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organizer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    # Inclusive range of organizer-local days to look in.
    window_start: Mapped[date] = mapped_column(Date, nullable=False)
    window_end: Mapped[date] = mapped_column(Date, nullable=False)
    # open | booked | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ical_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # app | email ("cc TimeIQ" on a thread; see services/meeting_agent.py)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="app", server_default="app")
    # Optional limits on candidate times, in the organizer's zone: minutes from
    # midnight, and allowed weekdays (0 = Monday).
    earliest_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latest_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weekdays: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Message-IDs of the email thread, so replies find their meeting.
    thread_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    thread_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Set once the organizer has been told everyone answered.
    all_answered_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    participants = relationship(
        "GroupMeetingParticipant",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="GroupMeetingParticipant.created_at",
        lazy="selectin",
    )
    organizer = relationship("User", foreign_keys=[organizer_id], lazy="joined")


class GroupMeetingParticipant(Base):
    __tablename__ = "group_meeting_participants"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.group_meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Secret for the participant's link; the link is their only credential.
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # A TimeIQ account that chose to share its free/busy for this meeting.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    uses_calendar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Slot starts (ISO, UTC) the participant ticked by hand.
    available_starts: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    meeting = relationship("GroupMeeting", back_populates="participants")
