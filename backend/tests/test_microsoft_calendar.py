"""Microsoft OAuth and Graph regression tests; every HTTP request is mocked."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from app import tasks
from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.calendar_source import CalendarSource
from app.models.user import User
from app.routers import calendars, microsoft_auth
from app.services import calendar_sync, microsoft_calendar
from app.services.calendar_health import CalendarSyncError, classify

REAL_CLIENT = httpx.AsyncClient
EXPIRED = datetime(2000, 1, 1, tzinfo=timezone.utc)


class FakeDB:
    def __init__(self, user=None, source=None):
        self.user = user or User(id=uuid.uuid4(), email="owner@example.com", timezone="America/New_York")
        self.source = source
        self.added, self.queries = [], []
        self.deleted = self.commits = self.rollbacks = 0

    async def execute(self, stmt):
        self.queries.append(stmt)
        if getattr(stmt, "is_delete", False):
            self.deleted += 1
            return None
        row = self.user if stmt.column_descriptions[0]["entity"] is User else self.source
        return SimpleNamespace(
            scalar_one_or_none=lambda: row,
            scalars=lambda: SimpleNamespace(first=lambda: row, all=lambda: [row] if row else []),
        )

    async def get(self, model, key):
        return self.user if model is User else self.source

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, CalendarSource):
            self.source = obj

    async def flush(self):
        if self.source is not None and self.source.id is None:
            self.source.id = uuid.uuid4()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    async def delete(self, obj):
        self.deleted += 1


def source(**kwargs):
    fields = dict(
        id=uuid.uuid4(), user_id=uuid.uuid4(), type="microsoft", name="Outlook",
        microsoft_access_token="access", microsoft_refresh_token="refresh",
        microsoft_account_id="account-1", sync_status="ok", sync_failures=0, is_active=True,
    )
    return CalendarSource(**dict(fields, **kwargs))


def event(**kwargs):
    fields = {
        "id": "event-1", "subject": "Work", "showAs": "busy",
        "start": {"dateTime": "2026-11-02T14:00:00.0000000", "timeZone": "UTC"},
        "end": {"dateTime": "2026-11-02T15:00:00.0000000", "timeZone": "UTC"},
    }
    return dict(fields, **kwargs)


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "MS_CLIENT_ID", "test-client")
    monkeypatch.setattr(settings, "MS_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "MS_TENANT", "common")
    monkeypatch.setattr(settings, "BACKEND_URL", "https://api.example.test/")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://example.test")


@pytest.fixture
def microsoft(monkeypatch):
    calls, box = [], {}

    def handler(request):
        calls.append(request)
        return box["handler"](request)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw))
    return box, calls


@pytest.fixture
async def oauth(microsoft):
    app = FastAPI()
    app.include_router(microsoft_auth.router)
    db = FakeDB()
    app.dependency_overrides[get_current_user] = lambda: db.user
    app.dependency_overrides[get_db] = lambda: db
    async with REAL_CLIENT(transport=httpx.ASGITransport(app=app), base_url="https://api.example.test") as client:
        yield client, db, app


def test_signed_state_round_trip_and_no_verifier_in_state():
    uid, verifier = uuid.uuid4(), "browser-verifier"
    state = microsoft_auth.make_state(uid, verifier, now=1000)
    assert microsoft_auth.read_state(state, verifier, now=1001) == uid
    assert verifier not in state


@pytest.mark.parametrize("kind", ["no_cookie", "other_browser", "tampered_user", "tampered_signature", "expired", "bare_id", "unicode"])
def test_invalid_state_rejected(kind):
    uid, verifier = uuid.uuid4(), "browser-verifier"
    state = microsoft_auth.make_state(uid, verifier, now=1000)
    cookie, now = verifier, 1001
    if kind == "no_cookie":
        cookie = None
    elif kind == "other_browser":
        cookie = "another-browser"
    elif kind == "tampered_user":
        state = str(uuid.uuid4()) + state[36:]
    elif kind == "tampered_signature":
        state = state[:-1] + ("a" if state[-1] != "a" else "b")
    elif kind == "expired":
        now = 1601
    elif kind == "bare_id":
        state = str(uid)
    else:
        state = state.rsplit(".", 1)[0] + ".☃"
    with pytest.raises(HTTPException) as exc:
        microsoft_auth.read_state(state, cookie, now=now)
    assert exc.value.status_code == 400


async def test_auth_url_pkce_cookie_scopes_and_tenant(oauth):
    client, db, _ = oauth
    response = await client.get("/api/microsoft/auth-url")
    assert response.status_code == 200
    url = urlsplit(response.json()["url"])
    params = parse_qs(url.query)
    assert url.netloc == "login.microsoftonline.com"
    assert url.path == "/common/oauth2/v2.0/authorize"
    assert params["scope"] == ["offline_access Calendars.Read User.Read"]
    assert params["redirect_uri"] == ["https://api.example.test/api/microsoft/callback"]
    assert params["code_challenge_method"] == ["S256"]
    verifier = client.cookies[microsoft_auth.STATE_COOKIE]
    assert params["code_challenge"] == [microsoft_auth.pkce_challenge(verifier)]
    assert microsoft_auth.read_state(params["state"][0], verifier) == db.user.id
    assert "client_secret" not in params and "code_verifier" not in params
    assert 43 <= len(verifier) <= 128
    cookie = response.headers["set-cookie"].lower()
    for attr in ("httponly", "secure", "samesite=lax", "path=/api/microsoft", "max-age=600"):
        assert attr in cookie
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("missing", ["MS_CLIENT_ID", "MS_CLIENT_SECRET"])
async def test_unconfigured_is_hidden_and_makes_no_external_calls(oauth, microsoft, monkeypatch, missing):
    client, db, _ = oauth
    monkeypatch.setattr(settings, missing, "")
    assert (await client.get("/api/microsoft/status")).json() == {"enabled": False}
    assert (await client.get("/api/microsoft/auth-url")).status_code == 501
    assert (await client.get("/api/microsoft/callback", params={"state": "ignored", "code": "ignored"})).status_code == 501
    with pytest.raises(CalendarSyncError):
        await microsoft_calendar.sync_microsoft_source(db, source())
    assert microsoft[1] == [] and db.added == []


async def test_status_is_public_and_auth_url_requires_sign_in(oauth):
    client, _, app = oauth

    def unauthorized():
        raise HTTPException(401, "Sign in")

    app.dependency_overrides[get_current_user] = unauthorized
    assert (await client.get("/api/microsoft/status")).json() == {"enabled": True}
    assert (await client.get("/api/microsoft/auth-url")).status_code == 401


@pytest.mark.parametrize("reconnect", [False, True])
async def test_callback_exchanges_pkce_and_saves_only_the_signed_owner(oauth, microsoft, reconnect):
    client, db, _ = oauth
    box, calls = microsoft
    if reconnect:
        db.source = source(user_id=db.user.id, sync_status="broken", sync_failures=4)
    existing = db.source

    def handler(request):
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 3600})
        assert request.headers["authorization"] == "Bearer new-access"
        if request.url.path == "/v1.0/me":
            return httpx.Response(200, json={"id": "account-1", "mail": "work@example.com"})
        return httpx.Response(200, json={"value": [event()]})

    box["handler"] = handler
    auth = (await client.get("/api/microsoft/auth-url")).json()
    state = parse_qs(urlsplit(auth["url"]).query)["state"][0]
    verifier = client.cookies[microsoft_auth.STATE_COOKIE]
    response = await client.get("/api/microsoft/callback", params={"state": state, "code": "auth-code"})
    assert response.status_code == 307
    assert response.headers["location"] == "https://example.test/calendars?microsoft=connected"
    assert microsoft_auth.STATE_COOKIE not in client.cookies
    form = parse_qs(calls[0].content.decode())
    assert form["code_verifier"] == [verifier]
    assert form["client_secret"] == ["test-secret"]
    assert form["grant_type"] == ["authorization_code"]
    assert form["redirect_uri"] == [settings.microsoft_redirect_uri]
    assert db.source.user_id == db.user.id
    assert db.source.name == "Outlook · work@example.com"
    assert db.source.microsoft_refresh_token == "new-refresh"
    assert db.source.microsoft_token_expires_at > datetime.now(timezone.utc)
    assert db.source.sync_status == "ok" and db.source.sync_failures == 0
    assert db.source.last_synced_at is not None
    assert len([x for x in db.added if isinstance(x, CalendarSource)]) == (0 if reconnect else 1)
    if reconnect:
        assert db.source is existing
    lookup = db.queries[1].compile().params
    assert db.user.id in lookup.values() and "microsoft" in lookup.values() and "account-1" in lookup.values()


async def test_callback_wrong_browser_fails_before_tokens_or_db(oauth, microsoft):
    client, db, _ = oauth
    state = microsoft_auth.make_state(db.user.id, "another-browser")
    response = await client.get("/api/microsoft/callback", params={"state": state, "code": "code"})
    assert response.status_code == 400
    assert microsoft[1] == [] and db.queries == []


async def test_denied_consent_clears_cookie_without_calling_graph(oauth, microsoft):
    client, db, _ = oauth
    auth = (await client.get("/api/microsoft/auth-url")).json()
    state = parse_qs(urlsplit(auth["url"]).query)["state"][0]
    response = await client.get("/api/microsoft/callback", params={"state": state, "error": "access_denied"})
    assert response.headers["location"].endswith("?microsoft=denied")
    assert microsoft_auth.STATE_COOKIE not in client.cookies
    assert microsoft[1] == [] and db.added == []


@pytest.mark.parametrize("body", [
    {"error": "invalid_grant"}, {"access_token": "access"}, {"refresh_token": "refresh"},
    {"access_token": "access", "refresh_token": "refresh", "expires_in": "invalid"},
])
async def test_invalid_token_callback_does_not_create_source(oauth, microsoft, body):
    client, db, _ = oauth
    box, calls = microsoft
    box["handler"] = lambda r: httpx.Response(200, json=body)
    auth = (await client.get("/api/microsoft/auth-url")).json()
    state = parse_qs(urlsplit(auth["url"]).query)["state"][0]
    response = await client.get("/api/microsoft/callback", params={"state": state, "code": "code"})
    assert response.headers["location"].endswith("?microsoft=failed")
    assert len(calls) == 1 and db.source is None


@pytest.mark.parametrize("failure", ["token", "profile", "network"])
async def test_callback_provider_failure_does_not_create_source(oauth, microsoft, failure):
    client, db, _ = oauth
    box, _ = microsoft

    def handler(request):
        if failure == "network":
            raise httpx.ConnectError("unavailable", request=request)
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(503 if failure == "token" else 200, json={
                "access_token": "access", "refresh_token": "refresh",
            })
        return httpx.Response(403)

    box["handler"] = handler
    auth = (await client.get("/api/microsoft/auth-url")).json()
    state = parse_qs(urlsplit(auth["url"]).query)["state"][0]
    response = await client.get("/api/microsoft/callback", params={"state": state, "code": "code"})
    assert response.headers["location"].endswith("?microsoft=failed")
    assert microsoft_auth.STATE_COOKIE not in client.cookies
    assert db.source is None and db.added == []


async def test_list_sources_checks_owner_and_excludes_microsoft_tokens(oauth):
    client, db, app = oauth
    app.include_router(calendars.router)
    db.source = source(user_id=db.user.id, created_at=EXPIRED)
    response = await client.get("/api/calendars")
    assert response.status_code == 200
    calendar = response.json()[0]
    assert calendar["type"] == "microsoft"
    assert not any(key.startswith("microsoft_") for key in calendar)
    assert db.user.id in db.queries[0].compile().params.values()


@pytest.mark.parametrize("action", ["disconnect", "sync"])
async def test_cannot_change_another_owners_source(oauth, microsoft, action):
    client, db, app = oauth
    app.include_router(calendars.router)
    source_id = uuid.uuid4()
    if action == "disconnect":
        response = await client.delete(f"/api/calendars/{source_id}")
    else:
        response = await client.post(f"/api/calendars/{source_id}/sync")
    assert response.status_code == 404
    lookup = db.queries[0].compile().params
    assert db.user.id in lookup.values() and source_id in lookup.values()
    assert db.deleted == 0 and microsoft[1] == []


async def test_owner_can_disconnect_outlook_through_existing_endpoint(oauth, microsoft):
    client, db, app = oauth
    app.include_router(calendars.router)
    db.source = source(user_id=db.user.id)
    response = await client.delete(f"/api/calendars/{db.source.id}")
    assert response.status_code == 204
    assert db.deleted == 1 and microsoft[1] == []


async def test_graph_mapping_free_busy_all_day_and_time_zones(microsoft):
    box, calls = microsoft
    box["handler"] = lambda r: httpx.Response(200, json={"value": [
        event(), event(showAs="free"), event(isCancelled=True),
        event(id="day", isAllDay=True, showAs="oof",
              start={"dateTime": "2026-11-01T04:00:00", "timeZone": "UTC"},
              end={"dateTime": "2026-11-02T05:00:00", "timeZone": "UTC"}),
        event(id="offset", showAs="tentative", start={"dateTime": "2026-11-02T09:00:00-05:00"},
              end={"dateTime": "2026-11-02T10:00:00-05:00"}),
        event(id="iana", showAs="workingElsewhere", start={"dateTime": "2026-11-02T09:00:00", "timeZone": "America/New_York"},
              end={"dateTime": "2026-11-02T10:00:00", "timeZone": "America/New_York"}),
    ]})
    db = FakeDB()
    assert await calendar_sync.sync_calendar_source(db, source()) == 4
    assert calls[0].headers["prefer"] == 'outlook.timezone="UTC"'
    first, all_day, offset, iana = db.added
    assert first.starts_at == datetime(2026, 11, 2, 14, tzinfo=timezone.utc)
    assert all_day.is_all_day and all_day.ends_at - all_day.starts_at == timedelta(hours=25)
    assert offset.starts_at == first.starts_at == iana.starts_at
    assert db.deleted == 1


async def test_graph_pagination_covers_google_window(microsoft):
    box, calls = microsoft
    next_link = f"{microsoft_calendar.GRAPH_URL}/me/calendarView?$skiptoken=second"
    box["handler"] = lambda r: httpx.Response(200, json={"value": [event()], **(
        {} if r.url.params.get("$skiptoken") else {"@odata.nextLink": next_link}
    )})
    db, s = FakeDB(), source()
    assert await microsoft_calendar.sync_microsoft_source(db, s) == 2
    assert len(calls) == 2 and str(calls[1].url) == next_link
    assert datetime.fromisoformat(calls[0].url.params["endDateTime"]) - datetime.fromisoformat(calls[0].url.params["startDateTime"]) == timedelta(days=90)
    assert all(e.calendar_source_id == s.id and e.user_id == s.user_id for e in db.added)


@pytest.mark.parametrize("failure", ["server", "bad_json", "malformed_event", "unsafe_page", "repeated_page", "page_limit"])
async def test_failed_fetch_never_replaces_previous_cache(microsoft, monkeypatch, failure):
    box, calls = microsoft
    next_link = f"{microsoft_calendar.GRAPH_URL}/me/calendarView?$skiptoken=second"
    monkeypatch.setattr(microsoft_calendar, "MICROSOFT_MAX_PAGES", 2)

    def handler(request):
        if len(calls) == 1:
            return httpx.Response(200, json={"value": [event()], "@odata.nextLink": next_link})
        if failure == "server":
            return httpx.Response(503)
        if failure == "bad_json":
            return httpx.Response(200, content=b"invalid")
        if failure == "malformed_event":
            return httpx.Response(200, json={"value": [event(start={})]})
        link = "https://attacker.example/steal" if failure == "unsafe_page" else (
            next_link if failure == "repeated_page" else next_link + "3"
        )
        return httpx.Response(200, json={"value": [], "@odata.nextLink": link})

    box["handler"] = handler
    db = FakeDB()
    with pytest.raises(CalendarSyncError):
        await microsoft_calendar.sync_microsoft_source(db, source())
    assert db.deleted == 0 and db.added == []
    assert len(calls) == 2


@pytest.mark.parametrize("rotated", [None, "rotated-refresh"])
async def test_expired_token_refreshes_and_preserves_or_rotates_refresh_token(microsoft, rotated):
    box, calls = microsoft

    def handler(request):
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "new-access", "expires_in": 3600, **(
                {"refresh_token": rotated} if rotated else {}
            )})
        assert request.headers["authorization"] == "Bearer new-access"
        return httpx.Response(200, json={"value": []})

    box["handler"] = handler
    s = source(microsoft_token_expires_at=EXPIRED)
    assert await microsoft_calendar.sync_microsoft_source(FakeDB(), s) == 0
    assert s.microsoft_access_token == "new-access"
    assert s.microsoft_refresh_token == (rotated or "refresh")
    assert s.microsoft_token_expires_at > datetime.now(timezone.utc)
    assert calls[0].url.path == "/common/oauth2/v2.0/token"
    form = parse_qs(calls[0].content.decode())
    assert form["grant_type"] == ["refresh_token"] and form["refresh_token"] == ["refresh"]
    assert form["client_secret"] == ["test-secret"]


@pytest.mark.parametrize("body", [
    {}, {"access_token": ""}, {"access_token": "access", "expires_in": 0},
    {"access_token": "access", "expires_in": "invalid"},
    {"access_token": "access", "refresh_token": {"unexpected": "secret"}},
])
async def test_malformed_refresh_leaves_tokens_and_cache_unchanged(microsoft, body):
    box, calls = microsoft
    box["handler"] = lambda r: httpx.Response(200, json=body)
    db, s = FakeDB(), source(microsoft_token_expires_at=EXPIRED)
    with pytest.raises(CalendarSyncError) as exc:
        await microsoft_calendar.sync_microsoft_source(db, s)
    assert not exc.value.permanent
    assert s.microsoft_access_token == "access" and s.microsoft_refresh_token == "refresh"
    assert s.microsoft_token_expires_at == EXPIRED
    assert len(calls) == 1 and db.deleted == 0


async def test_graph_unauthorized_refreshes_and_recovers(microsoft):
    box, calls = microsoft

    def handler(request):
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "new-access", "refresh_token": "new-refresh"})
        if request.headers["authorization"] == "Bearer access":
            return httpx.Response(401)
        return httpx.Response(200, json={"value": [event()]})

    box["handler"] = handler
    db, s = FakeDB(), source()
    assert await microsoft_calendar.sync_microsoft_source(db, s) == 1
    assert len(calls) == 3 and s.microsoft_refresh_token == "new-refresh"
    assert calls[0].url == calls[2].url


async def test_graph_unauthorized_refreshes_exactly_once(microsoft):
    box, calls = microsoft
    box["handler"] = lambda r: (
        httpx.Response(200, json={"access_token": "new-access"}) if r.url.host == "login.microsoftonline.com"
        else httpx.Response(401)
    )
    with pytest.raises(CalendarSyncError) as exc:
        await microsoft_calendar.sync_microsoft_source(FakeDB(), source())
    assert exc.value.permanent and "Reconnect Outlook" in exc.value.message
    assert len(calls) == 3


@pytest.mark.parametrize("status,body,permanent", [
    (400, {"error": "invalid_grant"}, True),
    (400, {"error": "interaction_required"}, True),
    (401, {"error": "invalid_client"}, False),
    (429, {}, False), (503, {}, False),
])
async def test_refresh_errors_are_actionable_without_secrets(microsoft, status, body, permanent):
    box, calls = microsoft
    box["handler"] = lambda r: httpx.Response(status, json=dict(body, error_description="private-secret"))
    with pytest.raises(CalendarSyncError) as exc:
        await microsoft_calendar.sync_microsoft_source(FakeDB(), source(microsoft_token_expires_at=EXPIRED))
    assert exc.value.permanent is permanent
    assert "private-secret" not in exc.value.message
    assert len(calls) == 1


async def test_token_network_error_is_transient(microsoft):
    box, _ = microsoft

    def handler(request):
        raise httpx.ConnectError("unavailable", request=request)

    box["handler"] = handler
    with pytest.raises(httpx.TransportError) as exc:
        await microsoft_calendar.sync_microsoft_source(FakeDB(), source(microsoft_token_expires_at=EXPIRED))
    assert not classify(exc.value).permanent


async def test_revoked_consent_enters_existing_health_flow(microsoft, monkeypatch):
    box, _ = microsoft
    box["handler"] = lambda r: httpx.Response(400, json={"error": "invalid_grant"})
    s = source(microsoft_token_expires_at=EXPIRED)
    db = FakeDB(source=s)
    notifications = []

    @asynccontextmanager
    async def session():
        yield db

    async def claim(*args):
        return True

    monkeypatch.setattr(tasks, "async_session", session)
    monkeypatch.setattr(tasks, "_claim_source", claim)
    monkeypatch.setattr(tasks, "send_calendar_broken", lambda *args: notifications.append(args))
    assert await tasks.sync_source(s.id, force=True) == "failed"
    assert s.sync_status == "failing" and "Reconnect Outlook" in s.last_sync_error
    assert await tasks.sync_source(s.id, force=True) == "failed"
    assert s.sync_status == "broken" and len(notifications) == 1
    assert db.deleted == 0 and db.rollbacks == 2


async def test_disabled_source_skips_cron_without_changing_health(microsoft, monkeypatch):
    s = source(sync_status="broken", sync_failures=3)
    db = FakeDB(source=s)

    @asynccontextmanager
    async def session():
        yield db

    async def claim(*args):
        return True

    monkeypatch.setattr(settings, "MS_CLIENT_SECRET", "")
    monkeypatch.setattr(tasks, "async_session", session)
    monkeypatch.setattr(tasks, "_claim_source", claim)
    assert await tasks.sync_source(s.id, force=True) == "skipped"
    assert s.sync_status == "broken" and s.sync_failures == 3
    assert microsoft[1] == []
