from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.booking_reminders import send_due_booking_reminders
from app.database import get_db
from app.services.booking_payments import expire_holds
from app.tasks import create_monthly_invoice_drafts, send_overdue_invoice_digests, sync_all_active_calendars

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cron"])


@router.get("/api/cron/booking-reminders")
async def cron_booking_reminders(
    authorization: str = Header(default="", description="Bearer <CRON_SECRET>"),
):
    """Send due booking reminders every 15 minutes."""
    _require_cron_secret(authorization)
    return {"status": "ok", "results": await send_due_booking_reminders()}


@router.get("/api/cron/expire-booking-payments")
async def cron_expire_booking_payments(authorization: str = Header(...), db: AsyncSession = Depends(get_db)):
    _require_cron_secret(authorization)
    return {"status": "ok", "processed": await expire_holds(db)}


def _require_cron_secret(authorization: str) -> None:
    """Reject the call unless CRON_SECRET is configured and the bearer matches.

    An empty secret disables every cron endpoint, so a missing env var can't
    turn ``Authorization: Bearer `` into a valid credential.
    """
    secret = settings.CRON_SECRET or ""
    if not secret.strip():
        logger.error("CRON_SECRET is not configured; rejecting cron call")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cron is not configured")
    expected = f"Bearer {secret}".encode()
    if not hmac.compare_digest(authorization.encode(), expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cron secret")


@router.get("/api/cron/sync-calendars")
async def cron_sync_calendars(
    authorization: str = Header(..., description="Bearer <CRON_SECRET>"),
):
    """
    Sync all active calendar sources.
    Called by Vercel Cron every 6 hours.
    """
    _require_cron_secret(authorization)

    results = await sync_all_active_calendars()
    logger.info(f"Cron sync completed: {results}")
    return {"status": "ok", "results": results}


@router.get("/api/cron/overdue-invoices")
async def cron_overdue_invoices(
    authorization: str = Header(..., description="Bearer <CRON_SECRET>"),
):
    """Email each user a digest of their sent-but-unpaid invoices past due. Weekly."""
    _require_cron_secret(authorization)
    results = await send_overdue_invoice_digests()
    logger.info(f"Overdue digest completed: {results}")
    return {"status": "ok", "results": results}


@router.get("/api/cron/monthly-invoices")
async def cron_monthly_invoices(
    authorization: str = Header(..., description="Bearer <CRON_SECRET>"),
):
    """Draft last month's invoices for clients with auto-invoicing on. Runs on the 1st."""
    _require_cron_secret(authorization)
    results = await create_monthly_invoice_drafts()
    logger.info(f"Monthly drafts completed: {results}")
    return {"status": "ok", "results": results}
