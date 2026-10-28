"""Locks shared by bookings and Connect payment transitions."""
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_host_bookings(db: AsyncSession, host_id: uuid.UUID) -> None:
    """Serialize availability decisions for a host until this transaction ends."""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"timeiq-booking-host:{host_id}"},
    )
