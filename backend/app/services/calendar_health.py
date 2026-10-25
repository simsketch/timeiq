"""Calendar sync health: what went wrong, whether it will fix itself, and when to retry.

A sync failure is either permanent (the link is gone, private, or not a calendar)
or transient (timeouts, server errors). Failing sources back off exponentially
from 1 hour to a day. A source turns 'broken' after a permanent error seen twice,
or after 3 days of failures; its owner is emailed once and it is retried daily.
Cached events from the last good sync keep blocking time until it recovers.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import httpx

from app.models.calendar_source import CalendarSource

BACKOFF_CAP = timedelta(hours=24)
BROKEN_AFTER = timedelta(days=3)
BROKEN_RETRY = timedelta(hours=24)


class CalendarSyncError(Exception):
    def __init__(self, message: str, permanent: bool):
        super().__init__(message)
        self.message = message
        self.permanent = permanent


def error_for_status(status_code: int, what: str = "calendar link") -> CalendarSyncError | None:
    """Translate an HTTP status from a calendar host; None when it is a success."""
    if status_code < 400:
        return None
    if status_code in (404, 410):
        return CalendarSyncError(
            f"The {what} returned 'not found'. It may have been unpublished or replaced with a new link.",
            permanent=True,
        )
    if status_code in (401, 403):
        return CalendarSyncError(
            f"The {what} is private. Publish the calendar or copy its public ICS link.", permanent=True
        )
    if status_code == 429 or status_code >= 500:
        return CalendarSyncError(
            f"The calendar's server had a problem (HTTP {status_code}). TimeIQ will retry.", permanent=False
        )
    return CalendarSyncError(f"The {what} was refused (HTTP {status_code}).", permanent=True)


def classify(exc: BaseException) -> CalendarSyncError:
    if isinstance(exc, CalendarSyncError):
        return exc
    if isinstance(exc, httpx.HTTPStatusError):
        return error_for_status(exc.response.status_code) or CalendarSyncError(str(exc), permanent=False)
    if isinstance(exc, httpx.TransportError):
        return CalendarSyncError("TimeIQ couldn't reach the calendar's server. It will retry.", permanent=False)
    # Unknown errors may be our own bugs; never call a link dead because of them.
    return CalendarSyncError("Something went wrong while syncing. TimeIQ will retry.", permanent=False)


def next_attempt_at(source: CalendarSource) -> datetime | None:
    """When a failing source may be tried again; None means any time."""
    if source.sync_status == "ok" or source.last_sync_attempt_at is None:
        return None
    if source.sync_status == "broken":
        delay = BROKEN_RETRY
    else:
        delay = min(timedelta(hours=2 ** max(source.sync_failures - 1, 0)), BACKOFF_CAP)
    return source.last_sync_attempt_at + delay


def is_due(source: CalendarSource, now: datetime) -> bool:
    when = next_attempt_at(source)
    return when is None or now >= when


def record_success(source: CalendarSource, now: datetime) -> None:
    source.sync_status = "ok"
    source.sync_failures = 0
    source.failing_since = None
    source.last_sync_attempt_at = now
    source.last_sync_error = None
    source.broken_notified_at = None


def record_failure(source: CalendarSource, err: CalendarSyncError, now: datetime) -> bool:
    """Count a failure. Returns True when the source just became broken and its
    owner has not been emailed yet."""
    source.sync_failures = (source.sync_failures or 0) + 1
    source.last_sync_attempt_at = now
    source.last_sync_error = err.message
    source.failing_since = source.failing_since or now
    broken = (err.permanent and source.sync_failures >= 2) or (now - source.failing_since >= BROKEN_AFTER)
    source.sync_status = "broken" if broken else "failing"
    return broken and source.broken_notified_at is None
