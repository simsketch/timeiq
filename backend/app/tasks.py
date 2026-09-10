from __future__ import annotations

import logging

from sqlalchemy import select

from app.database import async_session
from app.models.calendar_source import CalendarSource
from app.services.calendar_sync import sync_calendar_source

logger = logging.getLogger(__name__)


async def _sync_source_ids(source_ids: list) -> dict[str, int]:
    """
    Sync each calendar source in its own session.

    Isolation matters: AsyncSession.rollback() expires every ORM instance in
    the session (regardless of expire_on_commit), so a shared session would
    leave the remaining sources expired. Touching an expired attribute outside
    a greenlet context raises MissingGreenlet, which escapes the handler and
    aborts the whole run — one unreachable calendar would silently stop the
    nightly sync for every calendar and every user.
    """
    results = {"synced": 0, "failed": 0}

    for source_id in source_ids:
        try:
            async with async_session() as db:
                source = await db.get(CalendarSource, source_id)
                if source is None or not source.is_active:
                    continue
                name = source.name
                count = await sync_calendar_source(db, source)
                await db.commit()
                results["synced"] += 1
                logger.info(
                    f"Synced calendar source {source_id} ({name}): {count} events"
                )
        except Exception as e:
            results["failed"] += 1
            logger.error(f"Failed to sync calendar source {source_id}: {e}")

    return results


async def sync_all_active_calendars() -> dict[str, int]:
    """
    Sync all active calendar sources.
    Returns a dict with counts of successes and failures.
    """
    async with async_session() as db:
        result = await db.execute(
            select(CalendarSource.id).where(CalendarSource.is_active.is_(True))
        )
        source_ids = list(result.scalars().all())

    return await _sync_source_ids(source_ids)


async def sync_user_calendars(user_id) -> dict[str, int]:
    """
    Sync all active calendar sources for a specific user.
    """
    async with async_session() as db:
        result = await db.execute(
            select(CalendarSource.id).where(
                CalendarSource.user_id == user_id,
                CalendarSource.is_active.is_(True),
            )
        )
        source_ids = list(result.scalars().all())

    return await _sync_source_ids(source_ids)


async def send_overdue_invoice_digests() -> dict:
    """Group sent invoices past their due date by user and email one digest each."""
    from datetime import datetime, timezone
    from collections import defaultdict
    from sqlalchemy import select
    from app.database import async_session
    from app.models.invoice import Invoice
    from app.models.user import User
    from app.services.email import send_overdue_digest

    today = datetime.now(timezone.utc).date()
    async with async_session() as db:
        rows = (
            await db.execute(
                select(Invoice, User)
                .join(User, User.id == Invoice.user_id)
                .where(Invoice.status == "sent", Invoice.due_date < today)
                .order_by(Invoice.due_date.asc())
            )
        ).all()
    by_user: dict = defaultdict(list)
    users: dict = {}
    for inv, user in rows:
        by_user[user.id].append(inv)
        users[user.id] = user
    for uid, invoices in by_user.items():
        send_overdue_digest(users[uid], invoices, today)
    return {"users_emailed": len(by_user), "overdue_invoices": len(rows)}
