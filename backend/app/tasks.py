from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select, text

from app.database import async_session
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.services.calendar_health import classify, is_due, record_failure, record_success
from app.services.calendar_sync import sync_calendar_source
from app.services.email import send_calendar_broken

logger = logging.getLogger(__name__)

# Namespace for the per-source advisory locks (the other key is a hash of the id).
SYNC_LOCK_NAMESPACE = 7_140_311


async def _claim_source(db, source_id) -> bool:
    """Take this source's sync lock for the session's transaction, or report
    that another request or instance is already syncing it. The lock lives in
    Postgres, so it holds across serverless instances, and commit or rollback
    releases it."""
    got = await db.execute(
        text("SELECT pg_try_advisory_xact_lock(:ns, hashtext(:sid))"),
        {"ns": SYNC_LOCK_NAMESPACE, "sid": str(source_id)},
    )
    return bool(got.scalar())


async def sync_source(source_id, *, force: bool = False, stale_before: datetime | None = None) -> str:
    """
    Sync one calendar source in its own session and record its health.
    Returns 'synced', 'failed' or 'skipped' (inactive, already being synced,
    synced at or after stale_before, or backing off unless force).

    Concurrent calls share one fetch: whoever takes the source's advisory
    lock syncs, the rest skip. The source row is read after the lock, so a
    caller arriving just after another sync committed sees its fresh
    last_synced_at and skips too.

    Isolation matters: AsyncSession.rollback() expires every ORM instance in
    the session (regardless of expire_on_commit), so a shared session would
    leave the remaining sources expired. Touching an expired attribute outside
    a greenlet context raises MissingGreenlet, which escapes the handler and
    aborts the whole run. For the same reason a failure is recorded in a fresh
    session rather than on the rolled-back instance.
    """
    now = datetime.now(timezone.utc)
    async with async_session() as db:
        if not await _claim_source(db, source_id):
            return "skipped"
        source = await db.get(CalendarSource, source_id)
        if source is None or not source.is_active:
            return "skipped"
        if not force and not is_due(source, now):
            return "skipped"
        if stale_before is not None and source.last_synced_at is not None and source.last_synced_at >= stale_before:
            return "skipped"
        name = source.name
        try:
            count = await sync_calendar_source(db, source)
            record_success(source, now)
            await db.commit()
            logger.info(f"Synced calendar source {source_id} ({name}): {count} events")
            return "synced"
        except Exception as exc:
            err = classify(exc)
            await db.rollback()
            logger.error(f"Failed to sync calendar source {source_id} ({name}): {exc}")

    try:
        async with async_session() as db:
            source = await db.get(CalendarSource, source_id)
            if source is not None:
                if record_failure(source, err, now):
                    user = await db.get(User, source.user_id)
                    if user is not None:
                        send_calendar_broken(user, source)
                    source.broken_notified_at = now
                await db.commit()
    except Exception as exc:
        logger.error(f"Failed to record sync failure for {source_id}: {exc}")
    return "failed"


async def _sync_source_ids(source_ids: list, *, force: bool = False) -> dict[str, int]:
    results = {"synced": 0, "failed": 0, "skipped": 0}
    for source_id in source_ids:
        results[await sync_source(source_id, force=force)] += 1
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


STALE_AFTER = timedelta(minutes=10)


async def freshen_user_calendars(user_id, budget_seconds: float) -> int:
    """
    Re-sync a host's calendars that are more than STALE_AFTER old, so
    availability reflects events added since the hourly cron.

    Sources sync concurrently, each in its own session, within budget_seconds;
    past that the cached events stand. Failing sources keep their backoff.
    Returns how many sources synced (all considered ones if the budget ran out).
    """
    now = datetime.now(timezone.utc)
    async with async_session() as db:
        result = await db.execute(
            select(CalendarSource.id).where(
                CalendarSource.user_id == user_id,
                CalendarSource.is_active.is_(True),
                or_(
                    CalendarSource.last_synced_at.is_(None),
                    CalendarSource.last_synced_at < now - STALE_AFTER,
                ),
            )
        )
        source_ids = list(result.scalars().all())
    if not source_ids:
        return 0

    try:
        outcomes = await asyncio.wait_for(
            asyncio.gather(*(sync_source(sid, stale_before=now - STALE_AFTER) for sid in source_ids)),
            timeout=budget_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning(f"Calendar freshen for user {user_id} hit its {budget_seconds}s budget; using cached events")
        return len(source_ids)  # some may have finished; let the caller refetch
    return outcomes.count("synced")


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


async def create_monthly_invoice_drafts() -> dict:
    """On the 1st: for each client with auto_invoice_monthly, draft an invoice for
    last month's unbilled hours, then email each user a digest of their drafts."""
    from collections import defaultdict
    from datetime import datetime, timezone

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.database import async_session
    from app.models.client import Client
    from app.services.email import send_monthly_drafts_digest
    from app.services.invoicing_ops import create_invoice_from_entries, previous_month, unbilled_entries

    today = datetime.now(timezone.utc).date()
    start, end = previous_month(today)
    created: dict = defaultdict(list)
    users: dict = {}
    async with async_session() as db:
        clients = (
            await db.execute(select(Client).options(selectinload(Client.user)).where(Client.auto_invoice_monthly.is_(True)))
        ).scalars().all()
        for client in clients:
            user = client.user
            entries = await unbilled_entries(db, user, client.id, start, end)
            if not entries:
                continue
            invoice = await create_invoice_from_entries(db, user, client, entries, start, end)
            created[user.id].append(invoice)
            users[user.id] = user
        await db.commit()
        for uid, invoices in created.items():
            send_monthly_drafts_digest(users[uid], invoices, start, end)
    return {"clients_checked": len(clients), "drafts_created": sum(len(v) for v in created.values()), "users_emailed": len(created)}
