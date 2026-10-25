from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.models.calendar_source import CalendarSource
from app.services import calendar_sync
from app.services.calendar_health import (
    CalendarSyncError,
    classify,
    error_for_status,
    is_due,
    next_attempt_at,
    record_failure,
    record_success,
)

T0 = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
PERMANENT = CalendarSyncError("gone", permanent=True)
TRANSIENT = CalendarSyncError("timeout", permanent=False)


def source() -> CalendarSource:
    return CalendarSource(name="Work", type="ics_url", sync_status="ok", sync_failures=0)


def test_healthy_source_is_always_due():
    assert next_attempt_at(source()) is None
    assert is_due(source(), T0)


def test_transient_failures_back_off_exponentially_to_a_day():
    s = source()
    waits = []
    now = T0
    for _ in range(8):
        record_failure(s, TRANSIENT, now)
        waits.append(next_attempt_at(s) - now)
        now = next_attempt_at(s)
    hours = [w / timedelta(hours=1) for w in waits]
    assert hours[:6] == [1, 2, 4, 8, 16, 24]
    assert hours[6:] == [24, 24]
    assert not is_due(s, now - timedelta(minutes=1)) and is_due(s, now)


def test_permanent_error_breaks_on_second_failure_and_notifies_once():
    s = source()
    assert record_failure(s, PERMANENT, T0) is False
    assert s.sync_status == "failing"
    assert record_failure(s, PERMANENT, T0 + timedelta(hours=1)) is True
    assert s.sync_status == "broken"
    s.broken_notified_at = T0 + timedelta(hours=1)
    assert record_failure(s, PERMANENT, T0 + timedelta(days=1, hours=1)) is False
    assert next_attempt_at(s) == T0 + timedelta(days=2, hours=1)


def test_transient_errors_break_after_three_days():
    s = source()
    record_failure(s, TRANSIENT, T0)
    assert record_failure(s, TRANSIENT, T0 + timedelta(days=2, hours=23)) is False
    assert s.sync_status == "failing"
    assert record_failure(s, TRANSIENT, T0 + timedelta(days=3)) is True
    assert s.sync_status == "broken"


def test_success_clears_everything():
    s = source()
    record_failure(s, PERMANENT, T0)
    record_failure(s, PERMANENT, T0)
    s.broken_notified_at = T0
    record_success(s, T0 + timedelta(hours=2))
    assert (s.sync_status, s.sync_failures, s.failing_since, s.last_sync_error, s.broken_notified_at) == ("ok", 0, None, None, None)
    assert is_due(s, T0 + timedelta(hours=2))


@pytest.mark.parametrize(
    "code,permanent",
    [(404, True), (410, True), (401, True), (403, True), (400, True), (429, False), (500, False), (503, False)],
)
def test_status_classification(code, permanent):
    assert error_for_status(code).permanent is permanent
    assert error_for_status(200) is None


def test_unknown_and_network_errors_are_transient():
    assert classify(ValueError("bug")).permanent is False
    assert classify(httpx.ConnectTimeout("slow")).permanent is False


ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//t//EN\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261026T150000Z\r\nDTEND:20261026T160000Z\r\nSUMMARY:x\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"


@pytest.fixture
def feed(monkeypatch):
    """Route fetch_ics through a fake server: {url: (status, body, location)}."""
    routes: dict = {}
    seen: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        status, body, location = routes.get(str(request.url), (404, "", None))
        headers = {"location": location} if location else {}
        return httpx.Response(status, text=body, headers=headers)

    real = httpx.AsyncClient
    monkeypatch.setattr(calendar_sync.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return routes, seen


async def test_webcal_links_are_fetched_over_https(feed):
    routes, seen = feed
    routes["https://cal.example/a.ics"] = (200, ICS, None)
    cal = await calendar_sync.fetch_ics("  webcal://cal.example/a.ics ")
    assert seen == ["https://cal.example/a.ics"]
    assert len(cal.walk("VEVENT")) == 1


async def test_redirects_are_followed(feed):
    routes, _ = feed
    routes["https://cal.example/a.ics"] = (302, "", "https://p01.cal.example/a.ics")
    routes["https://p01.cal.example/a.ics"] = (200, ICS, None)
    assert len((await calendar_sync.fetch_ics("https://cal.example/a.ics")).walk("VEVENT")) == 1


async def test_outlook_error_page_redirect_is_not_found(feed):
    routes, _ = feed
    url = "https://outlook.office365.com/owa/calendar/x/calendar.ics"
    routes[url] = (302, "", "/owa/auth/errorFE.aspx?httpCode=404")
    routes["https://outlook.office365.com/owa/auth/errorFE.aspx?httpCode=404"] = (302, "", "https://outlook.office365.com/mail/olkerror.html?httpCode=404")
    routes["https://outlook.office365.com/mail/olkerror.html?httpCode=404"] = (500, "<html>error</html>", None)
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics(url)
    assert e.value.permanent and "not found" in e.value.message


@pytest.mark.parametrize(
    "status,body,needle,permanent",
    [
        (404, "", "not found", True),
        (403, "", "private", True),
        (503, "", "retry", False),
        (200, "<html>Sign in</html>", "web page", True),
        (200, "BEGIN:VCALENDAR\r\nnot really", "couldn't be read", True),
    ],
)
async def test_bad_feeds_explain_themselves(feed, status, body, needle, permanent):
    routes, _ = feed
    routes["https://cal.example/a.ics"] = (status, body, None)
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics("https://cal.example/a.ics")
    assert needle in e.value.message and e.value.permanent is permanent


async def test_non_links_are_rejected_without_a_request(feed):
    _, seen = feed
    with pytest.raises(CalendarSyncError):
        await calendar_sync.fetch_ics("my work calendar")
    assert seen == []


def test_broken_email_names_the_calendar_and_the_fix():
    from app.models.user import User
    from app.services.email import render_calendar_broken

    s = source()
    s.name = "PBG"
    record_failure(s, PERMANENT, T0)
    html = render_calendar_broken(User(email="a@b.c", timezone="America/New_York"), s)
    assert "PBG stopped syncing" in html and "gone" in html and "Publish a calendar" in html and "/calendars" in html
