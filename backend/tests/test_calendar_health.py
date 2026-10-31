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

    monkeypatch.setattr(
        calendar_sync,
        "_feed_client",
        lambda: calendar_sync._FeedClient(transport=httpx.MockTransport(handler), follow_redirects=False),
    )
    return routes, seen


@pytest.fixture(autouse=True)
def no_real_dns(monkeypatch):
    async def refuse(host, port):
        raise AssertionError(f"real DNS lookup attempted for {host}")

    monkeypatch.setattr(calendar_sync, "resolve_host", refuse)


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


# --- QA-001: private-network destinations -----------------------------------

@pytest.mark.parametrize(
    "ip,public",
    [
        ("8.8.8.8", True),
        ("2606:4700:4700::1111", True),
        ("127.0.0.1", False),
        ("10.1.2.3", False),
        ("172.16.0.1", False),
        ("192.168.1.1", False),
        ("169.254.169.254", False),
        ("100.64.0.1", False),
        ("0.0.0.0", False),
        ("224.0.0.1", False),
        ("240.0.0.1", False),
        ("::1", False),
        ("::", False),
        ("fe80::1", False),
        ("fc00::1", False),
        ("ff02::1", False),
        ("::ffff:127.0.0.1", False),
        ("::ffff:169.254.169.254", False),
        ("2002:7f00:1::", False),
        ("64:ff9b::a00:1", False),
    ],
)
def test_public_ip_classification(ip, public):
    assert calendar_sync.is_public_ip(ip) is public


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:80/private.ics",
        "http://10.0.0.1/a.ics",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/a.ics",
        "http://[::ffff:127.0.0.1]/a.ics",
        "http://0.0.0.0/a.ics",
        "http://localhost/a.ics",
        "webcal://calendar.localhost/a.ics",
        "https://cal.example:8443/a.ics",
    ],
)
async def test_private_or_odd_port_links_are_refused_without_a_request(feed, url):
    _, seen = feed
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics(url)
    assert e.value.permanent
    assert seen == []


async def test_redirect_to_private_address_is_refused(feed):
    routes, seen = feed
    routes["https://cal.example/a.ics"] = (302, "", "http://169.254.169.254/latest/meta-data")
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics("https://cal.example/a.ics")
    assert e.value.permanent and "private or local network" in e.value.message
    assert seen == ["https://cal.example/a.ics"]


async def test_redirect_loops_stop(feed):
    routes, seen = feed
    for i in range(10):
        routes[f"https://cal.example/{i}"] = (302, "", f"https://cal.example/{i + 1}")
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics("https://cal.example/0")
    assert e.value.permanent and "redirects" in e.value.message
    assert len(seen) == calendar_sync.MAX_REDIRECTS + 1


class _FakeStream(calendar_sync.httpcore.AsyncNetworkStream):
    pass


class _RecordingBackend(calendar_sync.httpcore.AsyncNetworkBackend):
    def __init__(self):
        self.connected = []

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.connected.append((host, port))
        return _FakeStream()


@pytest.mark.parametrize("answers", [["10.0.0.5"], ["93.184.216.34", "127.0.0.1"], ["::ffff:10.0.0.1"]])
async def test_host_names_resolving_to_private_addresses_are_refused(monkeypatch, answers):
    async def resolve(host, port):
        return answers

    monkeypatch.setattr(calendar_sync, "resolve_host", resolve)
    inner = _RecordingBackend()
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync._GuardedBackend(inner).connect_tcp("cal.example", 443)
    assert e.value.permanent and inner.connected == []


async def test_connections_go_to_the_vetted_address(monkeypatch):
    async def resolve(host, port):
        return ["93.184.216.34"]

    monkeypatch.setattr(calendar_sync, "resolve_host", resolve)
    inner = _RecordingBackend()
    await calendar_sync._GuardedBackend(inner).connect_tcp("cal.example", 443)
    assert inner.connected == [("93.184.216.34", 443)]


async def test_real_feed_transport_checks_resolved_addresses(monkeypatch):
    """The default (unmocked) transport resolves through the guard and refuses
    before opening any socket."""
    looked_up = []

    async def resolve(host, port):
        looked_up.append((host, port))
        return ["127.0.0.1"]

    monkeypatch.setattr(calendar_sync, "resolve_host", resolve)
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics("https://internal.example/a.ics")
    assert e.value.permanent and looked_up == [("internal.example", 443)]


# --- QA-019: size and expansion limits ----------------------------------------

async def test_oversized_feed_is_refused(feed):
    routes, _ = feed
    big = ICS.replace("SUMMARY:x", "SUMMARY:x\r\nDESCRIPTION:" + "y" * (calendar_sync.MAX_FEED_BYTES + 10))
    routes["https://cal.example/a.ics"] = (200, big, None)
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.fetch_ics("https://cal.example/a.ics")
    assert e.value.permanent and "larger than 5 MB" in e.value.message


def _cal(*events: str):
    from icalendar import Calendar

    body = "".join(f"BEGIN:VEVENT\r\n{e}\r\nEND:VEVENT\r\n" for e in events)
    return Calendar.from_ical(f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//t//EN\r\n{body}END:VCALENDAR\r\n")


W0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
W1 = W0 + timedelta(days=90)


def test_expansion_is_capped():
    cal = _cal("UID:m\r\nDTSTART:20261102T000000Z\r\nDTEND:20261102T000100Z\r\nRRULE:FREQ=MINUTELY")
    with pytest.raises(CalendarSyncError) as e:
        calendar_sync._expand_ics(cal, calendar_sync.host_zone("UTC"), W0, W1)
    assert e.value.permanent and "5,000" in e.value.message


# --- QA-011 / QA-016: all-day days and free events ---------------------------

def test_all_day_events_cover_the_hosts_local_day():
    cal = _cal("UID:a\r\nDTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261104")
    [row] = calendar_sync._expand_ics(cal, calendar_sync.host_zone("America/Los_Angeles"), W0, W1)
    assert row["is_all_day"]
    assert row["starts_at"] == datetime(2026, 11, 2, 8, tzinfo=timezone.utc)
    assert row["ends_at"] == datetime(2026, 11, 4, 8, tzinfo=timezone.utc)


def test_all_day_event_without_end_is_one_local_day_across_dst():
    # US clocks fall back on Nov 1 2026: that local day is 25 hours long.
    cal = _cal("UID:a\r\nDTSTART;VALUE=DATE:20261101")
    [row] = calendar_sync._expand_ics(cal, calendar_sync.host_zone("America/New_York"), W0 - timedelta(days=1), W1)
    assert row["starts_at"] == datetime(2026, 11, 1, 4, tzinfo=timezone.utc)
    assert row["ends_at"] == datetime(2026, 11, 2, 5, tzinfo=timezone.utc)


def test_invalid_host_zone_falls_back_to_new_york():
    assert calendar_sync.host_zone("Mars/Olympus").key == "America/New_York"
    assert calendar_sync.host_zone(None).key == "America/New_York"


def test_floating_times_are_host_local():
    cal = _cal("UID:f\r\nDTSTART:20261102T090000\r\nDTEND:20261102T100000")
    [row] = calendar_sync._expand_ics(cal, calendar_sync.host_zone("America/Chicago"), W0, W1)
    assert row["starts_at"] == datetime(2026, 11, 2, 15, tzinfo=timezone.utc)


def test_free_and_cancelled_ics_events_do_not_block():
    cal = _cal(
        "UID:busy\r\nDTSTART:20261102T140000Z\r\nDTEND:20261102T150000Z",
        "UID:free\r\nDTSTART:20261102T160000Z\r\nDTEND:20261102T170000Z\r\nTRANSP:TRANSPARENT",
        "UID:gone\r\nDTSTART:20261102T180000Z\r\nDTEND:20261102T190000Z\r\nSTATUS:CANCELLED",
    )
    rows = calendar_sync._expand_ics(cal, calendar_sync.host_zone("UTC"), W0, W1)
    assert [r["external_id"] for r in rows] == ["busy"]


def test_google_rows_skip_free_events_and_use_local_days():
    rows = calendar_sync._google_rows(
        [
            {"id": "busy", "start": {"dateTime": "2026-11-02T09:00:00-05:00"}, "end": {"dateTime": "2026-11-02T10:00:00-05:00"}},
            {"id": "free", "transparency": "transparent", "start": {"dateTime": "2026-11-02T11:00:00Z"}, "end": {"dateTime": "2026-11-02T12:00:00Z"}},
            {"id": "gone", "status": "cancelled", "start": {"dateTime": "2026-11-02T11:00:00Z"}, "end": {"dateTime": "2026-11-02T12:00:00Z"}},
            {"id": "day", "start": {"date": "2026-11-03"}, "end": {"date": "2026-11-04"}},
        ],
        calendar_sync.host_zone("America/Los_Angeles"),
    )
    assert [r["external_id"] for r in rows] == ["busy", "day"]
    assert rows[0]["starts_at"] == datetime(2026, 11, 2, 14, tzinfo=timezone.utc)
    assert (rows[1]["starts_at"], rows[1]["ends_at"]) == (
        datetime(2026, 11, 3, 8, tzinfo=timezone.utc),
        datetime(2026, 11, 4, 8, tzinfo=timezone.utc),
    )


# --- QA-012 / QA-015 / QA-017: Google sync ------------------------------------

class _FakeDB:
    def __init__(self, tz="America/New_York"):
        from app.models.user import User

        self.user = User(email="h@example.com", timezone=tz)
        self.added, self.deleted = [], 0

    async def get(self, model, key):
        return self.user

    async def execute(self, stmt):
        self.deleted += 1

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass


def _google_source(**kw):
    import uuid

    return CalendarSource(id=uuid.uuid4(), user_id=uuid.uuid4(), type="google", name="G", google_access_token="tok", **kw)


@pytest.fixture
def google(monkeypatch):
    """Route Google API calls to box["handler"](request)."""
    calls: list[httpx.Request] = []
    box = {}

    def handler(request):
        calls.append(request)
        return box["handler"](request)

    real = httpx.AsyncClient
    monkeypatch.setattr(calendar_sync.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return box, calls


def _event(i):
    return {"id": f"e{i}", "start": {"dateTime": "2026-11-02T14:00:00Z"}, "end": {"dateTime": "2026-11-02T15:00:00Z"}}


async def test_google_follows_every_page_and_covers_ninety_days(google):
    box, calls = google
    pages = {None: ([_event(1)], "p2"), "p2": ([_event(2)], "p3"), "p3": ([_event(3)], None)}

    def handler(request):
        items, nxt = pages[request.url.params.get("pageToken")]
        return httpx.Response(200, json={"items": items, **({"nextPageToken": nxt} if nxt else {})})

    box["handler"] = handler
    db = _FakeDB()
    assert await calendar_sync.sync_google_source(db, _google_source()) == 3
    assert [c.url.params.get("pageToken") for c in calls] == [None, "p2", "p3"]
    t0 = datetime.fromisoformat(calls[0].url.params["timeMin"])
    t1 = datetime.fromisoformat(calls[0].url.params["timeMax"])
    assert t1 - t0 == timedelta(days=90)
    assert db.deleted == 1 and len(db.added) == 3


async def test_google_page_failure_keeps_the_old_cache(google):
    box, _ = google
    box["handler"] = lambda r: (
        httpx.Response(503) if r.url.params.get("pageToken") else httpx.Response(200, json={"items": [_event(1)], "nextPageToken": "p2"})
    )
    db = _FakeDB()
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.sync_google_source(db, _google_source())
    assert not e.value.permanent
    assert db.deleted == 0 and db.added == []


async def test_google_pages_are_bounded(google):
    box, calls = google
    counter = iter(range(10_000))
    box["handler"] = lambda r: httpx.Response(200, json={"items": [], "nextPageToken": f"p{next(counter)}"})
    await calendar_sync.sync_google_source(_FakeDB(), _google_source())
    assert len(calls) == calendar_sync.GOOGLE_MAX_PAGES


EXPIRED = dict(google_refresh_token="refresh", google_token_expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc))


@pytest.mark.parametrize(
    "status,body,permanent",
    [
        (400, {"error": "invalid_grant"}, True),
        (401, {"error": "unauthorized_client"}, True),
        (429, {"error": "rate_limited"}, False),
        (500, {}, False),
        (503, {"error": "temporarily_unavailable"}, False),
    ],
)
async def test_google_token_refresh_failures(google, status, body, permanent):
    box, calls = google
    box["handler"] = lambda r: httpx.Response(status, json=body)
    with pytest.raises(CalendarSyncError) as e:
        await calendar_sync.sync_google_source(_FakeDB(), _google_source(**EXPIRED))
    assert e.value.permanent is permanent
    assert ("Reconnect" in e.value.message) is permanent
    assert [c.url.host for c in calls] == ["oauth2.googleapis.com"]


async def test_google_token_endpoint_unreachable_is_transient(google):
    box, _ = google

    def handler(request):
        raise httpx.ConnectError("down", request=request)

    box["handler"] = handler
    with pytest.raises(Exception) as e:
        await calendar_sync.sync_google_source(_FakeDB(), _google_source(**EXPIRED))
    assert classify(e.value).permanent is False


async def test_google_rejected_token_is_refreshed_once(google):
    box, calls = google

    def handler(request):
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "new", "expires_in": 3600})
        if request.headers["authorization"] == "Bearer tok":
            return httpx.Response(401)
        return httpx.Response(200, json={"items": [_event(1)]})

    box["handler"] = handler
    source = _google_source(google_refresh_token="refresh")
    assert await calendar_sync.sync_google_source(_FakeDB(), source) == 1
    assert source.google_access_token == "new" and len(calls) == 3


async def test_cron_sync_runs_in_parallel_and_defers_past_its_budget(monkeypatch):
    import asyncio

    from app import tasks

    started = []

    async def slow(source_id, force=False):
        started.append(source_id)
        await asyncio.sleep(0.2)
        return "synced"

    monkeypatch.setattr(tasks, "sync_source", slow)
    results = await tasks._sync_source_ids(list(range(40)), budget_seconds=0.3)
    # Eight at a time: two rounds start inside the budget, the rest wait for the next run.
    assert results["synced"] == len(started) == 16
    assert results["deferred"] == 24
