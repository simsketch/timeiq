from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CalendarHandoff(Base):
    """One Google or Outlook sign-in started from the mobile app.

    The app opens a one-time launch link in the system browser and keeps a
    secret whose hash is `app_challenge`. The provider's callback only parks the
    sign-in code here; the app then finishes with its own session and the
    secret, so a link started by one account can't connect anyone else's
    calendar to it."""

    __tablename__ = "calendar_handoffs"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    launch_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    app_challenge: Mapped[str] = mapped_column(String(64), nullable=False)
    # The browser cookie value: Google's nonce or Outlook's PKCE verifier.
    browser_secret: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
