"""Push notifications to the host's phones through Expo's push service.

Best effort: a push never breaks the request that triggered it. Tokens Expo
reports as no longer registered (app deleted, notifications revoked) are
dropped so they aren't tried again."""
from __future__ import annotations

import logging
import uuid
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import delete, select

from app.database import async_session
from app.models.push_device import PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def is_expo_token(token: str) -> bool:
    return (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")) and token.endswith("]")


async def notify(user_id: uuid.UUID, title: str, body: str, data: dict | None = None) -> None:
    try:
        async with async_session() as db:
            tokens = list((await db.execute(select(PushDevice.token).where(PushDevice.user_id == user_id))).scalars())
            if not tokens:
                return
            messages = [{"to": t, "title": title, "body": body, "sound": "default", "data": data or {}} for t in tokens]
            async with httpx.AsyncClient(timeout=4) as client:
                resp = await client.post(EXPO_PUSH_URL, json=messages, headers={"Accept": "application/json"})
            tickets = resp.json().get("data", []) if resp.status_code == 200 else []
            gone = [
                token for token, ticket in zip(tokens, tickets)
                if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
            ]
            if gone:
                await db.execute(delete(PushDevice).where(PushDevice.token.in_(gone)))
                await db.commit()
    except Exception:
        logger.exception("Push to user %s failed", user_id)


def _when(booking, host) -> str:
    try:
        zone = ZoneInfo(host.timezone or "UTC")
    except Exception:
        zone = ZoneInfo("UTC")
    local = booking.starts_at.astimezone(zone)
    return local.strftime("%a %b %-d, %-I:%M %p")


async def booking_event(kind: str, booking, event_type, host) -> None:
    """kind is "booked", "rescheduled" or "cancelled"."""
    titles = {"booked": "New booking", "rescheduled": "Booking moved", "cancelled": "Booking cancelled"}
    body = f"{booking.visitor_name} · {event_type.name} · {_when(booking, host)}"
    await notify(host.id, titles[kind], body, {"booking_id": str(booking.id), "kind": kind})
