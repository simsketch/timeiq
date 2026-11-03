"""Connecting Google or Outlook from the mobile app: the launch link works
once, the code is parked rather than used, and only the account that started
the sign-in, holding the app's secret, can finish it. Real PostgreSQL (atomic
update and row locks), so only against a local throwaway timeiq_qa* database.
Google and Microsoft are mocked."""
from __future__ import annotations

import base64
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.config import settings

if not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url):
    pytest.skip("needs a local timeiq_qa* database", allow_module_level=True)

from sqlalchemy import delete, select, update  # noqa: E402

from app.auth import get_current_user_clerk_id  # noqa: E402
from app.database import async_session, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CalendarHandoff, CalendarSource, User  # noqa: E402
from app.routers import google_auth, microsoft_auth  # noqa: E402

REAL_CLIENT = httpx.AsyncClient


def challenge_of(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


@pytest.fixture
async def env(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "g-client")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "g-secret")
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "https://api.example.test/api/google/callback")
    monkeypatch.setattr(settings, "MS_CLIENT_ID", "m-client")
    monkeypatch.setattr(settings, "MS_CLIENT_SECRET", "m-secret")
    monkeypatch.setattr(settings, "MS_TENANT", "common")
    monkeypatch.setattr(settings, "BACKEND_URL", "https://api.example.test")
    calls: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        host, path = request.url.host, request.url.path
        if host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "g-access", "refresh_token": "g-refresh", "expires_in": 3600})
        if host == "www.googleapis.com":
            return httpx.Response(200, json={"items": [{"id": "me@gmail.com", "summary": "Me", "primary": True}]})
        if host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "m-access", "refresh_token": "m-refresh", "expires_in": 3600})
        if path == "/v1.0/me":
            return httpx.Response(200, json={"id": "ms-1", "mail": "work@example.com"})
        return httpx.Response(200, json={"value": []})

    real = httpx.AsyncClient

    def mocked(**kw):
        if "transport" in kw:  # the test's own ASGI clients
            return real(**kw)
        return real(transport=httpx.MockTransport(provider), **kw)

    monkeypatch.setattr(httpx, "AsyncClient", mocked)

    key = uuid.uuid4().hex[:8]
    async with async_session() as db:
        owner = User(clerk_id=f"ho_{key}", username=f"ho_{key}", email=f"owner_{key}@example.com", timezone="UTC", subscription_status="active")
        other = User(clerk_id=f"hx_{key}", username=f"hx_{key}", email=f"other_{key}@example.com", timezone="UTC", subscription_status="active")
        db.add_all([owner, other])
        await db.commit()
    who = {"clerk": owner.clerk_id}
    app.dependency_overrides[get_current_user_clerk_id] = lambda: who["clerk"]
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    yield {"owner": owner, "other": other, "who": who, "calls": calls, "transport": transport}
    app.dependency_overrides.clear()
    async with async_session() as db:
        await db.execute(delete(User).where(User.clerk_id.in_([owner.clerk_id, other.clerk_id])))
        await db.commit()
    await engine.dispose()


def client(env) -> httpx.AsyncClient:
    """One cookie jar: the app's own requests, or one phone browser."""
    return REAL_CLIENT(transport=env["transport"], base_url="https://api.example.test")


async def start(env, provider="google"):
    verifier = secrets.token_urlsafe(48)
    async with client(env) as app_client:
        r = await app_client.post(f"/api/calendar-connect/{provider}/start", json={"challenge": challenge_of(verifier)})
    assert r.status_code == 200, r.text
    return verifier, r.json()["url"]


async def sign_in(env, url, provider="google", **callback):
    """The phone browser: open the launch link, then come back from the provider."""
    async with client(env) as browser:
        launched = await browser.get(url)
        assert launched.status_code == 302, launched.text
        state = parse_qs(urlsplit(launched.headers["location"]).query)["state"][0]
        params = {"state": state, **(callback or {"code": "auth-code"})}
        back = await browser.get(f"/api/{provider}/callback", params=params)
    assert back.status_code == 302, back.text
    return launched, parse_qs(urlsplit(back.headers["location"]).query), back.headers["location"]


async def finish(env, handoff, verifier):
    async with client(env) as app_client:
        return await app_client.post("/api/calendar-connect/finish", json={"handoff": handoff, "verifier": verifier})


async def sources(user_id):
    async with async_session() as db:
        return (await db.execute(select(CalendarSource).where(CalendarSource.user_id == user_id))).scalars().all()


async def test_google_from_the_app_connects_only_after_finish(env):
    verifier, url = await start(env)
    launched, back, location = await sign_in(env, url)
    assert location.startswith("timeiq://calendars?")
    assert back["connect"] == ["google"]
    assert urlsplit(launched.headers["location"]).netloc == "accounts.google.com"
    # The callback only parked the code: no token exchange, no calendar yet.
    assert env["calls"] == [] and await sources(env["owner"].id) == []

    r = await finish(env, back["handoff"][0], verifier)
    assert r.status_code == 200 and r.json() == {"connected": True, "name": "Me"}
    [source] = await sources(env["owner"].id)
    assert source.type == "google" and source.google_refresh_token == "g-refresh"
    # A handoff finishes once.
    assert (await finish(env, back["handoff"][0], verifier)).status_code == 400


async def test_outlook_from_the_app_sends_the_pkce_verifier_from_the_launch(env):
    verifier, url = await start(env, "microsoft")
    launched, back, _ = await sign_in(env, url, "microsoft")
    challenge = parse_qs(urlsplit(launched.headers["location"]).query)["code_challenge"][0]
    r = await finish(env, back["handoff"][0], verifier)
    assert r.status_code == 200 and r.json()["name"] == "Outlook · work@example.com"
    form = parse_qs(env["calls"][0].content.decode())
    assert microsoft_auth.pkce_challenge(form["code_verifier"][0]) == challenge


async def test_launch_link_works_once(env):
    _, url = await start(env)
    async with client(env) as browser:
        assert (await browser.get(url)).status_code == 302
    async with client(env) as someone_else:
        assert (await someone_else.get(url)).status_code == 400


async def test_another_account_or_a_wrong_secret_cannot_finish(env):
    verifier, url = await start(env)
    _, back, _ = await sign_in(env, url)
    handoff = back["handoff"][0]
    env["who"]["clerk"] = env["other"].clerk_id
    assert (await finish(env, handoff, verifier)).status_code == 400
    env["who"]["clerk"] = env["owner"].clerk_id
    assert (await finish(env, handoff, secrets.token_urlsafe(48))).status_code == 400
    assert env["calls"] == [] and await sources(env["owner"].id) == [] and await sources(env["other"].id) == []
    # The real app still can.
    assert (await finish(env, handoff, verifier)).status_code == 200


async def test_callback_in_a_different_browser_parks_nothing(env):
    _, url = await start(env)
    async with client(env) as browser:
        state = parse_qs(urlsplit((await browser.get(url)).headers["location"]).query)["state"][0]
    async with client(env) as other_browser:
        back = await other_browser.get("/api/google/callback", params={"state": state, "code": "stolen"})
    assert parse_qs(urlsplit(back.headers["location"]).query)["outcome"] == ["failed"]
    async with async_session() as db:
        h = (await db.execute(select(CalendarHandoff).where(CalendarHandoff.user_id == env["owner"].id))).scalar_one()
    assert h.code is None


async def test_denied_consent_goes_back_to_the_app(env):
    _, url = await start(env)
    _, back, _ = await sign_in(env, url, error="access_denied")
    assert back["outcome"] == ["denied"] and "handoff" not in back


async def test_expired_launch_link_is_refused(env):
    _, url = await start(env)
    async with async_session() as db:
        await db.execute(update(CalendarHandoff).where(CalendarHandoff.user_id == env["owner"].id)
                         .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
        await db.commit()
    async with client(env) as browser:
        assert (await browser.get(url)).status_code == 400


async def test_forged_mobile_state_is_rejected(env):
    async with client(env) as browser:
        r = await browser.get("/api/google/callback", params={"state": f"m.{uuid.uuid4()}.9999999999.{'0' * 64}", "code": "x"})
    assert r.status_code == 400


async def test_web_flow_is_unchanged(env):
    async with client(env) as browser:
        auth = (await browser.get("/api/google/auth-url")).json()
        state = parse_qs(urlsplit(auth["url"]).query)["state"][0]
        r = await browser.get("/api/google/callback", params={"state": state, "code": "web-code"})
    assert r.status_code == 307 and r.headers["location"].endswith("/calendars?google=connected")
    assert len(await sources(env["owner"].id)) == 1
    assert google_auth.STATE_COOKIE  # the web cookie name is unchanged
