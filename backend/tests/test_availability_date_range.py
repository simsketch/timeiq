from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import uuid

import httpx
import pytest
from fastapi import FastAPI

from app.routers import availability


@pytest.mark.parametrize("query,expected_days,expected_start", [
    ("days=3", 3, None),
    ("start_date=2026-10-31&end_date=2026-10-31", 1, date(2026, 10, 31)),
    ("start_date=2026-11-06&end_date=2026-11-08", 3, date(2026, 11, 6)),
    ("start_date=2026-11-01&end_date=2026-12-01", 31, date(2026, 11, 1)),
    ("start_date=2026-11-01", None, None),
    ("end_date=2026-11-01", None, None),
    ("start_date=2026-11-08&end_date=2026-11-06", None, None),
    ("start_date=2026-11-01&end_date=2026-12-02", None, None),
    ("start_date=2026-10-30&end_date=2026-10-31", None, None),
    ("start_date=2027-02-01&end_date=2027-02-01", None, None),
    ("start_date=2026-02-30&end_date=2026-11-01", None, None),
])
async def test_inclusive_custom_range_and_boundaries(monkeypatch, query, expected_days, expected_start):
    now = datetime(2026, 11, 1, 3, 30, tzinfo=timezone.utc)  # Still Oct 31 in New York.

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)

    monkeypatch.setattr(availability, "datetime", Clock)
    windows = AsyncMock(return_value=[])
    sync = AsyncMock()
    monkeypatch.setattr(availability, "free_windows", windows)
    monkeypatch.setattr(availability, "freshen_user_calendars", sync)
    app = FastAPI()
    app.include_router(availability.router)
    app.dependency_overrides[availability.get_current_user] = lambda: SimpleNamespace(id=uuid.uuid4(), username="host", timezone="America/New_York")
    app.dependency_overrides[availability.get_db] = lambda: None
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        result = await client.get(f"/api/availability/summary?{query}")
    assert result.status_code == (200 if expected_days else 422), result.text
    if expected_days:
        assert windows.await_args.kwargs["days"] == expected_days
        assert windows.await_args.kwargs["start_date"] == expected_start
        assert windows.await_args.kwargs["now"] == now
        assert result.json()["timezone"] == "America/New_York"
    else:
        windows.assert_not_awaited()
        sync.assert_not_awaited()
