from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.calendar_source import CalendarSource
from app.services.calendar_health import CalendarSyncError, error_for_status
from app.services.calendar_sync import SYNC_DAYS_AHEAD, _replace_cached_events

GRAPH_URL = "https://graph.microsoft.com/v1.0"
SCOPES = "offline_access Calendars.Read User.Read"
MICROSOFT_MAX_PAGES = 50


def authority_url() -> str:
    tenant = quote(settings.MS_TENANT.strip() or "common", safe="")
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0"


def _microsoft_revoked() -> CalendarSyncError:
    return CalendarSyncError(
        "Outlook access expired or was revoked. Reconnect Outlook in TimeIQ.", permanent=True
    )


def token_values(data: dict) -> tuple[str, datetime]:
    """Validate tokens without including the response or its secrets in errors."""
    access_token = data.get("access_token")
    try:
        expires_in = int(data.get("expires_in", 3600))
        if not isinstance(access_token, str) or not access_token or expires_in <= 0:
            raise ValueError
        if data.get("refresh_token") is not None and not isinstance(data["refresh_token"], str):
            raise ValueError
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    except (ValueError, TypeError, OverflowError):
        raise CalendarSyncError(
            "Outlook's sign-in response couldn't be read. Try connecting Outlook again.", permanent=False
        ) from None
    return access_token, expires_at


def response_data(response: httpx.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        data = None
    return data if isinstance(data, dict) else {}


async def _refresh_microsoft_token(db: AsyncSession, source: CalendarSource) -> str:
    if not source.microsoft_refresh_token:
        raise _microsoft_revoked()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{authority_url()}/token",
            data={
                "client_id": settings.MS_CLIENT_ID,
                "client_secret": settings.MS_CLIENT_SECRET,
                "refresh_token": source.microsoft_refresh_token,
                "grant_type": "refresh_token",
                "scope": SCOPES,
            },
        )
    data = response_data(resp)
    if resp.status_code == 200:
        access_token, expires_at = token_values(data)
        source.microsoft_access_token = access_token
        source.microsoft_token_expires_at = expires_at
        # Microsoft rotates refresh tokens. Keep the last one if omitted.
        source.microsoft_refresh_token = data.get("refresh_token") or source.microsoft_refresh_token
        await db.flush()
        return access_token
    if data.get("error") in ("invalid_grant", "interaction_required", "consent_required"):
        raise _microsoft_revoked()
    raise CalendarSyncError(
        f"Outlook's sign-in service had a problem (HTTP {resp.status_code}). TimeIQ will retry.", permanent=False
    )


def _microsoft_instant(value: dict) -> datetime:
    try:
        instant = datetime.fromisoformat(value["dateTime"])
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=ZoneInfo(value.get("timeZone") or "UTC"))
        return instant.astimezone(timezone.utc)
    except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError):
        raise CalendarSyncError(
            "Outlook returned an event time that TimeIQ couldn't read. Try syncing again.", permanent=False
        ) from None


def _microsoft_rows(items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        if item.get("isCancelled") or item.get("showAs") == "free":
            continue
        starts_at = _microsoft_instant(item.get("start") or {})
        ends_at = _microsoft_instant(item.get("end") or {})
        if ends_at <= starts_at:
            raise CalendarSyncError(
                "Outlook returned an event with an invalid end time. Try syncing again.", permanent=False
            )
        # Graph returns all-day boundaries as dateTimes too. Keep the actual
        # instants, including any UTC offset, rather than truncating to dates.
        rows.append(
            dict(
                title=(item.get("subject") or "")[:500] or None,
                starts_at=starts_at,
                ends_at=ends_at,
                is_all_day=bool(item.get("isAllDay")),
                external_id=(item.get("id") or "")[:500] or None,
            )
        )
    return rows


def _check_next_link(url: str) -> None:
    try:
        parsed = httpx.URL(url)
        valid = (
            parsed.scheme == "https" and parsed.host == "graph.microsoft.com"
            and parsed.port in (None, 443) and not parsed.userinfo
            and parsed.path.startswith("/v1.0/")
        )
    except (httpx.InvalidURL, TypeError):
        valid = False
    if not valid:
        raise CalendarSyncError("Outlook returned an invalid next page. TimeIQ will retry.", permanent=False)


async def sync_microsoft_source(db: AsyncSession, source: CalendarSource) -> int:
    """Read all calendarView pages before replacing the shared busy-event cache."""
    if not settings.microsoft_enabled:
        raise CalendarSyncError("Outlook is not configured. Contact TimeIQ to enable it.", permanent=False)

    access_token = source.microsoft_access_token
    refreshed = False
    if not access_token or (
        source.microsoft_token_expires_at
        and source.microsoft_token_expires_at <= datetime.now(timezone.utc) + timedelta(seconds=60)
    ):
        access_token = await _refresh_microsoft_token(db, source)
        refreshed = True

    now = datetime.now(timezone.utc)
    params = {
        "startDateTime": now.isoformat(),
        "endDateTime": (now + timedelta(days=SYNC_DAYS_AHEAD)).isoformat(),
        "$top": "1000",
        "$select": "id,subject,start,end,isAllDay,isCancelled,showAs",
    }
    url = f"{GRAPH_URL}/me/calendarView"
    seen = {url}
    items: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for _ in range(MICROSOFT_MAX_PAGES):
            while True:
                resp = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {access_token}", "Prefer": 'outlook.timezone="UTC"'},
                    params=params,
                )
                if resp.status_code == 401 and not refreshed:
                    access_token = await _refresh_microsoft_token(db, source)
                    refreshed = True
                    continue
                break
            if resp.status_code in (401, 403):
                raise _microsoft_revoked()
            err = error_for_status(resp.status_code, "Outlook calendar")
            if err:
                raise err
            data = response_data(resp)
            if not isinstance(data.get("value"), list):
                raise CalendarSyncError("Outlook's calendar response couldn't be read. TimeIQ will retry.", permanent=False)
            items.extend(data["value"])
            next_link = data.get("@odata.nextLink")
            if not next_link:
                break
            _check_next_link(next_link)
            if next_link in seen:
                raise CalendarSyncError("Outlook repeated a calendar page. TimeIQ will retry.", permanent=False)
            seen.add(next_link)
            url, params = next_link, None
        else:
            raise CalendarSyncError("Outlook returned too many calendar pages. TimeIQ will retry.", permanent=False)

    return await _replace_cached_events(db, source, _microsoft_rows(items))
