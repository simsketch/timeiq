from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserEmailAlias(Base):
    __tablename__ = "user_email_aliases"
    __table_args__ = (CheckConstraint("email = lower(email)", name="lowercase"), {"schema": "timeiq"})

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    verify_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    verification_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class EmailAddressNotice(Base):
    """Persistent email cooldowns, including senders without an account."""

    __tablename__ = "email_address_notices"
    __table_args__ = {"schema": "timeiq"}

    key: Mapped[str] = mapped_column(String(340), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
