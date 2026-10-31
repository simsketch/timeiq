from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OutboundEmail(Base):
    """A transactional email Resend refused, kept until a retry delivers it.

    ``key`` is the Resend idempotency key, so a retry of a send that did get
    through (a timeout after Resend accepted it) is not delivered twice.
    """

    __tablename__ = "outbound_emails"
    __table_args__ = {"schema": "timeiq"}

    key: Mapped[str] = mapped_column(String(256), primary_key=True)
    what: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
