from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
import typing
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpcore
import httpx
import recurring_ical_events
from icalendar import Calendar
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cached_event import CachedEvent
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.config import settings
from app.services.calendar_health import CalendarSyncError, error_for_status

logger = logging.getLogger(__name__)

# How far ahead calendars are cached. Bookings are capped at the same horizon,
# so every bookable time is checked against a synced calendar.
SYNC_DAYS_AHEAD = 90
MAX_FEED_BYTES = 5 * 1024 * 1024
MAX_OCCURRENCES = 5000
MAX_REDIRECTS = 5
GOOGLE_MAX_PAGES = 20
DEFAULT_TIMEZONE = "America/New_York"


# ---------------------------------------------------------------------------
# Outbound safety: calendar links are user input, so a feed fetch must never
# reach loopback, private, link-local or other non-public addresses. Literal
# IPs are checked before each request and redirect hop; host names are
# resolved and checked when the connection is opened, and the connection goes
# to the vetted address, so DNS can't swap in a private one afterwards.
# ---------------------------------------------------------------------------

def _blocked() -> CalendarSyncError:
    return CalendarSyncError(
        "That link points to a private or local network address, which TimeIQ can't fetch. "
        "Use the calendar's public link.",
        permanent=True,
    )


def is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.split("%", 1)[0].strip("[]"))
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address):
        embedded = addr.ipv4_mapped or addr.sixtofour
        if embedded is None and addr in ipaddress.ip_network("64:ff9b::/96"):
            embedded = ipaddress.IPv4Address(int(addr) & 0xFFFFFFFF)
        if embedded is None and addr.teredo:
            embedded = addr.teredo[1]
        if embedded is not None and not is_public_ip(str(embedded)):
            return False
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
        or not addr.is_global
    )


async def _system_resolve(host: str, port: int) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


# Swappable in tests so they never do real DNS.
resolve_host: typing.Callable[[str, int], typing.Awaitable[list[str]]] = _system_resolve


def _ip_literal(host: str) -> str | None:
    try:
        return str(ipaddress.ip_address(host.strip("[]")))
    except ValueError:
        return None


async def vetted_addresses(host: str, port: int) -> list[str]:
    """Public addresses for host; raises if any address is non-public."""
    literal = _ip_literal(host)
    if literal is not None:
        if not is_public_ip(literal):
            raise _blocked()
        return [literal]
    try:
        addrs = await resolve_host(host, port)
    except (socket.gaierror, OSError) as exc:
        raise httpcore.ConnectError(f"Could not resolve {host}: {exc}") from exc
    if not addrs:
        raise httpcore.ConnectError(f"Could not resolve {host}")
    if not all(is_public_ip(a) for a in addrs):
        raise _blocked()
    return list(dict.fromkeys(addrs))


class _GuardedBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, inner: httpcore.AsyncNetworkBackend):
        self._inner = inner

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        last: Exception | None = None
        for ip in await vetted_addresses(host, port):
            try:
                return await self._inner.connect_tcp(
                    ip, port, timeout=timeout, local_address=local_address, socket_options=socket_options
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout, OSError) as exc:
                last = exc
        raise last or httpcore.ConnectError(f"Could not connect to {host}")

    async def connect_unix_socket(self, *args, **kwargs):  # pragma: no cover
        raise _blocked()

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


class _FeedClient(httpx.AsyncClient):
    """An AsyncClient whose default transport only connects to public addresses."""

    def _init_transport(self, *args, transport=None, **kwargs):
        if transport is not None:
            return transport
        built = super()._init_transport(*args, **kwargs)
        pool = getattr(built, "_pool", None)
        if pool is None or not hasattr(pool, "_network_backend"):
            raise RuntimeError("httpx transport layout changed; refusing unguarded calendar fetches")
        pool._network_backend = _GuardedBackend(pool._network_backend)
        return built


def _feed_client() -> httpx.AsyncClient:
    # trust_env=False: an environment proxy would connect on our behalf and skip the guard.
    return _FeedClient(timeout=30.0, follow_redirects=False, trust_env=False)


def _check_url(url: httpx.URL) -> None:
    if url.scheme not in ("http", "https"):
        raise CalendarSyncError(
            "That doesn't look like a calendar link. It should start with https:// or webcal://.", permanent=True
        )
    if not url.host:
        raise CalendarSyncError("That calendar link has no web address in it.", permanent=True)
    if url.port not in (None, 80, 443):
        raise CalendarSyncError(
            "Calendar links must use the standard web ports. Copy the calendar's public link.", permanent=True
        )
    host = url.host.lower().rstrip(".")
    if host == "localhost" or host.endswith(".localhost"):
        raise _blocked()
    literal = _ip_literal(host)
    if literal is not None and not is_public_ip(literal):
        raise _blocked()


def _redirected_error_code(urls: list[httpx.URL]) -> int | None:
    """Outlook answers a dead feed by redirecting to error pages that carry the
    real status as ?httpCode=404 (the last page itself returns 500)."""
    for url in urls:
        code = url.params.get("httpCode")
        if code and code.isdigit() and int(code) >= 400:
            return int(code)
    return None


def _too_big() -> CalendarSyncError:
    return CalendarSyncError(
        f"That calendar file is larger than {MAX_FEED_BYTES // (1024 * 1024)} MB, which TimeIQ can't import. "
        "Share a calendar with fewer past events.",
        permanent=True,
    )


async def fetch_ics(ics_url: str) -> Calendar:
    """Download and parse an ICS feed, raising CalendarSyncError with a reason
    the calendar's owner can act on."""
    # iCloud and Outlook hand out webcal:// links; the feed itself is plain
    # HTTPS, and iCloud redirects it to a per-account server.
    raw = ics_url.strip()
    if raw.lower().startswith("webcal://"):
        raw = "https://" + raw[len("webcal://"):]
    if not raw.lower().startswith(("http://", "https://")):
        raise CalendarSyncError("That doesn't look like a calendar link. It should start with https:// or webcal://.", permanent=True)
    try:
        url = httpx.URL(raw)
    except httpx.InvalidURL:
        raise CalendarSyncError("That calendar link isn't a valid web address.", permanent=True)

    seen: list[httpx.URL] = []
    async with _feed_client() as client:
        for _ in range(MAX_REDIRECTS + 1):
            _check_url(url)
            seen.append(url)
            async with client.stream("GET", url) as resp:
                if resp.is_redirect and resp.next_request is not None:
                    url = resp.next_request.url
                    continue
                err = error_for_status(_redirected_error_code(seen) or resp.status_code)
                if err:
                    raise err
                length = resp.headers.get("content-length", "")
                if length.isdigit() and int(length) > MAX_FEED_BYTES:
                    raise _too_big()
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body += chunk
                    if len(body) > MAX_FEED_BYTES:
                        raise _too_big()
                encoding = resp.charset_encoding or "utf-8"
                break
        else:
            raise CalendarSyncError("That calendar link redirects too many times.", permanent=True)

    try:
        text = bytes(body).decode(encoding, errors="replace")
    except LookupError:
        text = bytes(body).decode("utf-8", errors="replace")
    if "BEGIN:VCALENDAR" not in text[:2000].upper():
        raise CalendarSyncError(
            "That link opens a web page, not a calendar file. Copy the ICS (iCal) link instead.", permanent=True
        )
    try:
        return Calendar.from_ical(text)
    except Exception:
        raise CalendarSyncError("The calendar file at that link couldn't be read.", permanent=True)


# ---------------------------------------------------------------------------
# Converting events to busy intervals
# ---------------------------------------------------------------------------

def host_zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


async def _owner_zone(db: AsyncSession, source: CalendarSource) -> ZoneInfo:
    user = await db.get(User, source.user_id)
    return host_zone(user.timezone if user else None)


def _local_midnight(day: date, tz: ZoneInfo) -> datetime:
    """An all-day date covers the host's local day: local midnight, as UTC."""
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)


def _instant(value: datetime, tz: ZoneInfo) -> datetime:
    """A floating (zone-less) time is the host's local time."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=tz)
    return value.astimezone(timezone.utc)


def _ics_is_free(component) -> bool:
    transp = str(component.get("TRANSP", "")).strip().upper()
    status = str(component.get("STATUS", "")).strip().upper()
    return transp == "TRANSPARENT" or status == "CANCELLED"


def _expand_ics(cal: Calendar, tz: ZoneInfo, window_start: datetime, window_end: datetime) -> list[dict]:
    """Busy intervals in the window, with at most MAX_OCCURRENCES expanded."""
    query = recurring_ical_events.of(cal)
    start, stop = query.to_datetime(window_start), query.to_datetime(window_end)
    rows: list[dict] = []
    seen = 0
    for series in query.series:
        for occurrence in series.between(start, stop):
            seen += 1
            if seen > MAX_OCCURRENCES:
                raise CalendarSyncError(
                    f"That calendar has more than {MAX_OCCURRENCES:,} events in the next {SYNC_DAYS_AHEAD} days, "
                    "which TimeIQ can't import.",
                    permanent=True,
                )
            component = occurrence.as_component(False)
            if _ics_is_free(component):
                continue
            dtstart = component.get("dtstart")
            if dtstart is None:
                continue
            dtend = component.get("dtend")
            start_val = dtstart.dt
            end_val = dtend.dt if dtend is not None else None
            is_all_day = not isinstance(start_val, datetime)
            if is_all_day:
                starts_at = _local_midnight(start_val, tz)
                if isinstance(end_val, date) and not isinstance(end_val, datetime) and end_val > start_val:
                    ends_at = _local_midnight(end_val, tz)
                else:
                    ends_at = _local_midnight(start_val + timedelta(days=1), tz)
            else:
                starts_at = _instant(start_val, tz)
                if isinstance(end_val, datetime):
                    ends_at = _instant(end_val, tz)
                else:
                    duration = component.get("duration")
                    ends_at = starts_at + (duration.dt if duration is not None else timedelta(hours=1))
            uid = str(component.get("uid", ""))
            summary = str(component.get("summary", ""))
            rows.append(
                dict(
                    title=summary[:500] if summary else None,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    is_all_day=is_all_day,
                    external_id=uid[:500] if uid else None,
                )
            )
    return rows


async def _replace_cached_events(db: AsyncSession, source: CalendarSource, rows: list[dict]) -> int:
    """Swap the source's cache for rows. Callers build every row first, so a
    failed fetch or parse leaves the previous cache in place."""
    await db.execute(delete(CachedEvent).where(CachedEvent.calendar_source_id == source.id))
    for row in rows:
        db.add(CachedEvent(id=uuid.uuid4(), calendar_source_id=source.id, user_id=source.user_id, **row))
    source.last_synced_at = datetime.now(timezone.utc)
    await db.flush()
    return len(rows)


async def sync_ics_source(db: AsyncSession, source: CalendarSource, cal: Calendar | None = None) -> int:
    """
    Fetch events from an ICS URL (or use cal, already fetched) and replace the
    source's cached_events. Returns the number of events synced.
    """
    if not source.ics_url:
        raise CalendarSyncError("This calendar has no link. Add its ICS link.", permanent=True)
    if cal is None:
        cal = await fetch_ics(source.ics_url)
    now = datetime.now(timezone.utc)
    rows = _expand_ics(cal, await _owner_zone(db, source), now - timedelta(days=1), now + timedelta(days=SYNC_DAYS_AHEAD))
    return await _replace_cached_events(db, source, rows)


def _google_revoked() -> CalendarSyncError:
    # A fresh instance each time: re-raising one shared exception keeps
    # appending to its traceback.
    return CalendarSyncError(
        "Google access expired or was revoked. Reconnect Google Calendar in TimeIQ.", permanent=True
    )


def _google_rows(items: list[dict], tz: ZoneInfo) -> list[dict]:
    rows = []
    for item in items:
        if item.get("status") == "cancelled" or item.get("transparency") == "transparent":
            continue
        start = item.get("start") or {}
        end = item.get("end") or {}
        if "dateTime" in start:
            starts_at = _instant(datetime.fromisoformat(start["dateTime"]), tz)
            ends_at = _instant(datetime.fromisoformat(end["dateTime"]), tz) if "dateTime" in end else starts_at + timedelta(hours=1)
            is_all_day = False
        elif "date" in start:
            first = date.fromisoformat(start["date"])
            last = date.fromisoformat(end["date"]) if "date" in end else first + timedelta(days=1)
            starts_at = _local_midnight(first, tz)
            ends_at = _local_midnight(max(last, first + timedelta(days=1)), tz)
            is_all_day = True
        else:
            continue
        rows.append(
            dict(
                title=(item.get("summary", "") or "")[:500] or None,
                starts_at=starts_at,
                ends_at=ends_at,
                is_all_day=is_all_day,
                external_id=(item.get("id", "") or "")[:500] or None,
            )
        )
    return rows


async def sync_google_source(db: AsyncSession, source: CalendarSource) -> int:
    """
    Fetch every page of events from the Google Calendar API, then replace the
    source's cached_events. Returns the number of events synced.
    """
    if not source.google_access_token:
        raise _google_revoked()

    access_token = source.google_access_token
    refreshed = False
    if source.google_token_expires_at and source.google_token_expires_at <= datetime.now(timezone.utc):
        access_token = await _refresh_google_token(db, source)
        refreshed = True

    calendar_id = source.google_calendar_id or "primary"
    now = datetime.now(timezone.utc)
    base_params = {
        "timeMin": now.isoformat(),
        "timeMax": (now + timedelta(days=SYNC_DAYS_AHEAD)).isoformat(),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "2500",
    }
    items: list[dict] = []
    page_token: str | None = None
    tokens_seen: set[str] = set()
    async with httpx.AsyncClient(timeout=30.0) as client:
        for _ in range(GOOGLE_MAX_PAGES):
            params = dict(base_params, **({"pageToken": page_token} if page_token else {}))
            while True:
                resp = await client.get(
                    f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params=params,
                )
                if resp.status_code == 401 and not refreshed:
                    access_token = await _refresh_google_token(db, source)
                    refreshed = True
                    continue
                break
            err = error_for_status(resp.status_code, "Google calendar")
            if err:
                raise err
            data = resp.json()
            items.extend(data.get("items", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
            if page_token in tokens_seen:
                logger.warning(f"Google returned a repeated page token for source {source.id}; stopping")
                break
            tokens_seen.add(page_token)
        else:
            # 20 pages x 2500 events: everything beyond is far in the future.
            logger.warning(f"Google source {source.id} has more than {GOOGLE_MAX_PAGES} pages; keeping the first ones")

    return await _replace_cached_events(db, source, _google_rows(items, await _owner_zone(db, source)))


async def _refresh_google_token(db: AsyncSession, source: CalendarSource) -> str:
    """Refresh the Google OAuth access token. A refused grant means access was
    revoked (permanent); an unavailable token endpoint is retried (transient)."""
    if not source.google_refresh_token:
        raise _google_revoked()

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": source.google_refresh_token,
                "grant_type": "refresh_token",
            },
        )
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    if resp.status_code == 200 and data.get("access_token"):
        source.google_access_token = data["access_token"]
        source.google_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
        await db.flush()
        return data["access_token"]
    if data.get("error") == "invalid_grant" or resp.status_code in (400, 401):
        raise _google_revoked()
    raise CalendarSyncError(
        f"Google's sign-in service had a problem (HTTP {resp.status_code}). TimeIQ will retry.", permanent=False
    )


async def sync_calendar_source(db: AsyncSession, source: CalendarSource, *, ics_calendar: Calendar | None = None) -> int:
    """Sync a calendar source based on its type. ics_calendar reuses a feed
    that was just downloaded to validate the link."""
    if source.type == "ics_url":
        return await sync_ics_source(db, source, ics_calendar)
    elif source.type == "google":
        return await sync_google_source(db, source)
    elif source.type == "microsoft":
        from app.services.microsoft_calendar import sync_microsoft_source

        return await sync_microsoft_source(db, source)
    return 0
