from __future__ import annotations

import logging

from sqlalchemy import select

from app.database import async_session
from app.models.calendar_source import CalendarSource
from app.services.calendar_sync import sync_calendar_source

logger = logging.getLogger(__name__)


async def sync_all_active_calendars() -> dict[str, int]:
    """
    Sync all active calendar sources.
    Returns a dict with counts of successes and failures.
    """
    results = {"synced": 0, "failed": 0}

    async with async_session() as db:
        result = await db.execute(
            select(CalendarSource).where(CalendarSource.is_active.is_(True))
        )
        sources = result.scalars().all()

        for source in sources:
            try:
                count = await sync_calendar_source(db, source)
                await db.commit()
                results["synced"] += 1
                logger.info(
                    f"Synced calendar source {source.id} ({source.name}): {count} events"
                )
            except Exception as e:
                await db.rollback()
                results["failed"] += 1
                logger.error(
                    f"Failed to sync calendar source {source.id} ({source.name}): {e}"
                )

    return results


async def sync_user_calendars(user_id) -> dict[str, int]:
    """
    Sync all active calendar sources for a specific user.
    """
    results = {"synced": 0, "failed": 0}

    async with async_session() as db:
        result = await db.execute(
            select(CalendarSource).where(
                CalendarSource.user_id == user_id,
                CalendarSource.is_active.is_(True),
            )
        )
        sources = result.scalars().all()

        for source in sources:
            try:
                count = await sync_calendar_source(db, source)
                await db.commit()
                results["synced"] += 1
                logger.info(
                    f"Synced calendar source {source.id} ({source.name}): {count} events"
                )
            except Exception as e:
                await db.rollback()
                results["failed"] += 1
                logger.error(
                    f"Failed to sync calendar source {source.id} ({source.name}): {e}"
                )

    return results
