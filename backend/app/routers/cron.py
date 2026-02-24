from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, status

from app.config import settings
from app.tasks import sync_all_active_calendars

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cron"])


@router.get("/api/cron/sync-calendars")
async def cron_sync_calendars(
    authorization: str = Header(..., description="Bearer <CRON_SECRET>"),
):
    """
    Sync all active calendar sources.
    Called by Vercel Cron every 6 hours.
    """
    expected = f"Bearer {settings.CRON_SECRET}"
    if authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid cron secret",
        )

    results = await sync_all_active_calendars()
    logger.info(f"Cron sync completed: {results}")
    return {"status": "ok", "results": results}
