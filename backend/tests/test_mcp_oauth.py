"""OAuth flows and races on a local, throwaway timeiq_qa* Postgres database.

Clerk sessions are stubbed; unexpected outbound HTTP fails the test.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
import uuid
from datetime import timedelta
from types import SimpleNamespace as NS
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi import Request
from sqlalchemy import delete, select

from app.config import settings
from app.services import oauth

pytestmark = pytest.mark.skipif(
    not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url),
    reason="needs a local timeiq_qa* database",
)

from app.auth import get_current_user_clerk_id  # noqa: E402
from app.database import async_session, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.models.oauth import OAuthAccessToken, OAuthAuthorizationCode, OAuthClient, OAuthGrant, OAuthRefreshToken  # noqa: E402
from app.services import api_tokens, billing  # noqa: E402

ACCEPT = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25"}
REDIRECT = "https://client.example/callback?source=timeiq"
VERIFIER = "v" * 64
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()


@pytest.fixture
async def env(monkeypatch):
    key = uuid.uuid4().hex[:12]
    monkeypatch.setattr(settings, "BACKEND_URL", "https://api.example.test")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.test")
    monkeypatch.setattr(billing, "enabled", lambda: False)

    def no_network(request):
        raise AssertionError("unexpected outbound HTTP")

    original_init = httpx.AsyncClient.__init__

    def safe_init(self, *args, **kwargs):
        if not isinstance(kwargs.get("transport"), (httpx.ASGITransport, httpx.MockTransport)):
            kwargs["transport"] = httpx.MockTransport(no_network)
        original_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", safe_init)
    async with async_session() as db:
        users = [User(clerk_id=f"user_{key}{i}", username=f"oauth{key}{i}", email=f"oauth{i}@example.com",
                      name=f"OAuth {i}", subscription_status="active") for i in range(2)]
        db.add_all(users)
        await db.commit()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(key, 1234)), base_url="https://api.example.test") as client:
        try:
            yield NS(client=client, users=users, ip=key)
        finally:
            app.dependency_overrides.clear()
            async with async_session() as db:
                await db.execute(delete(OAuthClient).where(OAuthClient.registration_ip_hash == oauth.hash_secret(key)))
                await db.execute(delete(User).where(User.id.in_([u.id for u in users])))
                await db.commit()
            await engine.dispose()


async def session(env, method, path, *, user=0, **kwargs):
    async def clerk(request: Request):
        request.state.auth_method = "session"
        return env.users[user].clerk_id

    app.dependency_overrides[get_current_user_clerk_id] = clerk
    try:
        return await env.client.request(method, path, **kwargs)
    finally:
        app.dependency_overrides.clear()


async def register(env, **kwargs):
    r = await env.client.post("/oauth/register", json={"client_name": "Test assistant", "redirect_uris": [REDIRECT], **kwargs})
    assert r.status_code == 201, r.text
    return r.json()["client_id"]


def params(client_id, **kwargs):
    return {"client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT, "code_challenge": CHALLENGE,
            "code_challenge_method": "S256", "resource": oauth.resource_url(), "state": "opaque +/?& state", **kwargs}


async def authorize(env, client_id):
    r = await env.client.get("/oauth/authorize", params=params(client_id))
    assert r.status_code == 302, r.text
    assert r.headers["location"].startswith("https://app.example.test/oauth/consent?")
    assert r.headers["cache-control"] == "no-store"
    return parse_qs(urlsplit(r.headers["location"]).query)["request"][0]


async def approve(env, client_id):
    request = await authorize(env, client_id)
    details = await session(env, "GET", "/api/oauth/consent", params={"request": request})
    assert details.status_code == 200 and details.json()["client_name"] == "Test assistant"
    r = await session(env, "POST", "/api/oauth/consent", json={"request": request, "allow": True})
    assert r.status_code == 200, r.text
    query = parse_qs(urlsplit(r.json()["redirect_url"]).query)
    assert query["state"] == ["opaque +/?& state"] and query["iss"] == [oauth.issuer()]
    assert query["source"] == ["timeiq"]
    return query["code"][0], request


def token_params(registered_client_id, code, **kwargs):
    return {"client_id": registered_client_id, "grant_type": "authorization_code", "code": code,
            "redirect_uri": REDIRECT, "code_verifier": VERIFIER, "resource": oauth.resource_url(), **kwargs}


async def tokens(env, client_id):
    code, _ = await approve(env, client_id)
    r = await env.client.post("/oauth/token", data=token_params(client_id, code))
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store" and r.headers["pragma"] == "no-cache"
    return r.json()


async def refresh(env, client_id, token, **kwargs):
    return await env.client.post("/oauth/token", data={"grant_type": "refresh_token", "client_id": client_id,
        "refresh_token": token, "resource": oauth.resource_url(), **kwargs})


async def rpc(env, token, method="tools/list", params=None):
    return await env.client.post("/mcp", headers={**ACCEPT, "Authorization": f"Bearer {token}"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


async def test_full_flow_discovery_to_revocation(env):
    for path in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"):
        metadata = await env.client.get(path)
        assert metadata.json()["resource"] == oauth.resource_url()
        assert metadata.json()["authorization_servers"] == [oauth.issuer()]
    meta = (await env.client.get("/.well-known/oauth-authorization-server")).json()
    assert meta["issuer"] == oauth.issuer() and meta["code_challenge_methods_supported"] == ["S256"]
    assert meta["token_endpoint_auth_methods_supported"] == ["none"]
    assert meta["authorization_response_iss_parameter_supported"]
    missing = await env.client.post("/mcp", json={})
    assert missing.status_code == 401
    assert f'resource_metadata="{oauth.issuer()}/.well-known/oauth-protected-resource/mcp"' in missing.headers["www-authenticate"]

    client_id = await register(env)
    out = await tokens(env, client_id)
    assert 3590 <= out["expires_in"] <= 3600 and out["token_type"] == "Bearer"
    assert out["scope"] == "mcp"
    init = await rpc(env, out["access_token"], "initialize", {
        "protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"},
    })
    assert init.status_code == 200, init.text
    listed = await rpc(env, out["access_token"])
    assert listed.status_code == 200, listed.text
    assert "get_profile" in {t["name"] for t in listed.json()["result"]["tools"]}
    called = await rpc(env, out["access_token"], "tools/call", {"name": "get_profile", "arguments": {}})
    assert json.loads(called.json()["result"]["content"][0]["text"])["username"] == env.users[0].username
    connections = (await session(env, "GET", "/api/me/connections")).json()
    assert len(connections) == 1 and connections[0]["last_used_at"] and connections[0]["client_name"] == "Test assistant"

    rotated = await refresh(env, client_id, out["refresh_token"])
    assert rotated.status_code == 200, rotated.text
    fresh = rotated.json()
    assert fresh["refresh_token"] != out["refresh_token"] and fresh["access_token"] != out["access_token"]
    assert (await rpc(env, fresh["access_token"])).status_code == 200
    revoked = await env.client.post("/oauth/revoke", data={"client_id": client_id, "token": fresh["refresh_token"]})
    assert revoked.status_code == 200
    for access in (out["access_token"], fresh["access_token"]):
        assert (await rpc(env, access)).status_code == 401
    assert (await refresh(env, client_id, fresh["refresh_token"])).status_code == 400
    assert (await session(env, "GET", "/api/me/connections")).json() == []


async def test_only_hashes_are_stored(env):
    client_id = await register(env)
    code, request = await approve(env, client_id)
    out = (await env.client.post("/oauth/token", data=token_params(client_id, code))).json()
    async with async_session() as db:
        stored = (await db.execute(select(OAuthAuthorizationCode).where(OAuthAuthorizationCode.client_id == client_id))).scalar_one()
        assert stored.code_hash == oauth.hash_secret(code) and stored.request_hash == oauth.hash_secret(request)
        access = (await db.execute(select(OAuthAccessToken).where(OAuthAccessToken.grant_id == stored.grant_id))).scalar_one()
        refresh_token = (await db.execute(select(OAuthRefreshToken).where(OAuthRefreshToken.grant_id == stored.grant_id))).scalar_one()
        assert access.token_hash == oauth.hash_secret(out["access_token"])
        assert refresh_token.token_hash == oauth.hash_secret(out["refresh_token"])


@pytest.mark.parametrize("change,error", [
    ({"code_verifier": "x" * 64}, "invalid_grant"), ({"code_verifier": "short"}, "invalid_grant"),
    ({"redirect_uri": "https://client.example/callback/"}, "invalid_grant"),
    ({"resource": "https://other.example/mcp"}, "invalid_target"), ({"resource": ""}, "invalid_target"),
    ({"client_id": "unknown"}, "invalid_client"),
])
async def test_code_exchange_rejects_wrong_bindings_without_consuming_code(env, change, error):
    client_id = await register(env)
    code, _ = await approve(env, client_id)
    bad = await env.client.post("/oauth/token", data=token_params(client_id, code, **change))
    assert bad.status_code == 400 and bad.json()["error"] == error
    good = await env.client.post("/oauth/token", data=token_params(client_id, code))
    assert good.status_code == 200, good.text


async def test_code_and_refresh_cannot_be_exchanged_by_another_client(env):
    first, second = await register(env), await register(env)
    code, _ = await approve(env, first)
    assert (await env.client.post("/oauth/token", data=token_params(second, code))).status_code == 400
    out = (await env.client.post("/oauth/token", data=token_params(first, code))).json()
    assert (await refresh(env, second, out["refresh_token"])).status_code == 400
    assert (await refresh(env, first, out["refresh_token"])).status_code == 200


@pytest.mark.parametrize("change", [
    {"redirect_uri": REDIRECT + "/"}, {"redirect_uri": "https://attacker.example"},
    {"code_challenge_method": "plain"}, {"code_challenge_method": ""}, {"code_challenge": "short"},
    {"resource": "https://other.example/mcp"}, {"scope": "admin"}, {"response_type": "token"},
])
async def test_authorization_validates_before_redirecting(env, change):
    client_id = await register(env)
    r = await env.client.get("/oauth/authorize", params=params(client_id, **change))
    assert r.status_code == 400 and "location" not in r.headers


async def test_cancel_and_consent_replay(env):
    client_id = await register(env)
    request = await authorize(env, client_id)
    cancel = await session(env, "POST", "/api/oauth/consent", json={"request": request, "allow": False})
    query = parse_qs(urlsplit(cancel.json()["redirect_url"]).query)
    assert query["error"] == ["access_denied"] and "code" not in query
    assert (await session(env, "GET", "/api/me/connections")).json() == []
    for allow in (True, False):
        assert (await session(env, "POST", "/api/oauth/consent", json={"request": request, "allow": allow})).status_code == 400
    _, request = await approve(env, client_id)
    assert (await session(env, "POST", "/api/oauth/consent", json={"request": request, "allow": True})).status_code == 400


async def test_concurrent_code_exchange_has_one_winner_and_revokes_family(env):
    client_id = await register(env)
    code, _ = await approve(env, client_id)
    rs = await asyncio.gather(*[env.client.post("/oauth/token", data=token_params(client_id, code)) for _ in range(2)])
    assert sorted(r.status_code for r in rs) == [200, 400]
    out = next(r.json() for r in rs if r.status_code == 200)
    assert (await rpc(env, out["access_token"])).status_code == 401
    assert (await refresh(env, client_id, out["refresh_token"])).status_code == 400


async def test_concurrent_refresh_has_one_winner_and_revokes_family(env):
    client_id = await register(env)
    out = await tokens(env, client_id)
    rs = await asyncio.gather(*[refresh(env, client_id, out["refresh_token"]) for _ in range(2)])
    assert sorted(r.status_code for r in rs) == [200, 400], [r.text for r in rs]
    fresh = next(r.json() for r in rs if r.status_code == 200)
    for access in (out["access_token"], fresh["access_token"]):
        assert (await rpc(env, access)).status_code == 401
    assert (await refresh(env, client_id, fresh["refresh_token"])).status_code == 400


async def test_expiry_and_audience_are_checked_at_the_resource(env, monkeypatch):
    client_id = await register(env)
    out = await tokens(env, client_id)
    async with async_session() as db:
        grant = (await db.execute(select(OAuthGrant).where(OAuthGrant.client_id == client_id))).scalar_one()
        grant.resource = "https://other.example/mcp"
        await db.commit()
    assert (await rpc(env, out["access_token"])).status_code == 401
    async with async_session() as db:
        grant = await db.get(OAuthGrant, grant.id)
        grant.resource = oauth.resource_url()
        await db.commit()
    assert (await rpc(env, out["access_token"])).status_code == 200
    later = oauth.now() + timedelta(hours=2)
    monkeypatch.setattr(oauth, "now", lambda: later)
    assert (await rpc(env, out["access_token"])).status_code == 401
    assert (await env.client.get("/api/me", headers={"Authorization": f"Bearer {out['access_token']}"})).status_code == 401
    fresh = (await refresh(env, client_id, out["refresh_token"])).json()
    assert (await rpc(env, fresh["access_token"])).status_code == 200
    monkeypatch.setattr(oauth, "now", lambda: later + timedelta(days=61))
    assert (await refresh(env, client_id, fresh["refresh_token"])).status_code == 400


async def test_expired_consent_and_code(env, monkeypatch):
    client_id = await register(env)
    request = await authorize(env, client_id)
    code, _ = await approve(env, client_id)
    later = oauth.now() + timedelta(minutes=11)
    monkeypatch.setattr(oauth, "now", lambda: later)
    r = await session(env, "POST", "/api/oauth/consent", json={"request": request, "allow": True})
    assert r.status_code == 400
    r = await env.client.post("/oauth/token", data=token_params(client_id, code))
    assert r.status_code == 400 and r.json()["error"] == "invalid_grant"


async def test_oauth_and_personal_tokens_cannot_manage_credentials_or_consent(env):
    client_id = await register(env)
    out = await tokens(env, client_id)
    request = await authorize(env, client_id)
    async with async_session() as db:
        _, personal = await api_tokens.create(db, env.users[0], "Existing personal token")
        await db.commit()
    for raw in (out["access_token"], personal):
        auth = {"Authorization": f"Bearer {raw}"}
        assert (await rpc(env, raw)).status_code == 200
        for method, path, data in (
            ("GET", "/api/me/tokens", None), ("POST", "/api/me/tokens", {"name": "x"}),
            ("DELETE", f"/api/me/tokens/{uuid.uuid4()}", None), ("DELETE", "/api/me", None),
            ("GET", "/api/me/connections", None), ("DELETE", f"/api/me/connections/{uuid.uuid4()}", None),
            ("GET", f"/api/oauth/consent?request={request}", None),
            ("POST", "/api/oauth/consent", {"request": request, "allow": True}),
        ):
            r = await env.client.request(method, path, headers=auth, json=data)
            assert r.status_code == 403, (path, r.text)


async def test_disconnect_and_revoke_enforce_ownership(env):
    first, second = await register(env), await register(env)
    out = await tokens(env, first)
    connection = (await session(env, "GET", "/api/me/connections")).json()[0]["id"]
    assert (await session(env, "GET", "/api/me/connections", user=1)).json() == []
    assert (await session(env, "DELETE", f"/api/me/connections/{connection}", user=1)).status_code == 404
    assert (await env.client.post("/oauth/revoke", data={"client_id": second, "token": out["access_token"]})).status_code == 200
    assert (await rpc(env, out["access_token"])).status_code == 200
    assert (await session(env, "DELETE", f"/api/me/connections/{connection}")).status_code == 204
    assert (await rpc(env, out["access_token"])).status_code == 401
    assert (await refresh(env, first, out["refresh_token"])).status_code == 400


async def test_subscription_gate_matches_existing_tokens(env, monkeypatch):
    client_id = await register(env)
    out = await tokens(env, client_id)
    async with async_session() as db:
        user = await db.get(User, env.users[0].id)
        user.subscription_status = "canceled"
        await db.commit()
    monkeypatch.setattr(billing, "enabled", lambda: True)
    r = await rpc(env, out["access_token"], "tools/call", {"name": "list_bookings", "arguments": {}})
    assert r.json()["result"]["isError"] and "subscription" in r.json()["result"]["content"][0]["text"]
    assert (await session(env, "GET", "/api/me/connections")).status_code == 200


@pytest.mark.parametrize("uri", [
    "http://client.example/cb", "https://client.example/cb#fragment", "javascript:alert(1)",
    "https://user:password@client.example/cb", "http://localhost.evil.example/cb", "http://127.0.0.2/cb",
    "https://client.example:99999/cb", "https://client.example\\@evil.example/cb", "https://client.example/cb\n",
    "https://client.example/cb?code=already", "https://@client.example/cb",
])
async def test_registration_refuses_unsafe_redirects(env, uri):
    r = await env.client.post("/oauth/register", json={"redirect_uris": [uri]})
    assert r.status_code == 400 and r.json()["error"] == "invalid_redirect_uri"


@pytest.mark.parametrize("uri", ["https://client.example/cb", "http://localhost:1234/cb", "http://127.0.0.1:5678/cb", "http://[::1]:5678/cb"])
async def test_registration_allows_https_and_loopback(env, uri):
    client_id = await register(env, redirect_uris=[uri])
    r = await env.client.get("/oauth/authorize", params=params(client_id, redirect_uri=uri))
    assert r.status_code == 302


async def test_registration_limit_is_shared_and_ignores_spoofed_forwarding_headers(env):
    rs = await asyncio.gather(*[env.client.post("/oauth/register", json={"redirect_uris": [REDIRECT]},
        headers={"X-Forwarded-For": f"198.51.100.{i}"}) for i in range(12)])
    assert sorted(r.status_code for r in rs) == [201] * 10 + [429] * 2
    assert all(r.headers.get("retry-after") == "3600" for r in rs if r.status_code == 429)


async def test_public_cors_and_ambiguous_or_oversized_requests(env):
    client_id = await register(env)
    preflight = await env.client.options("/oauth/token", headers={"Origin": "https://client.example",
        "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert preflight.status_code == 200 and preflight.headers["access-control-allow-origin"] == "*"
    private = await env.client.options("/api/oauth/consent", headers={"Origin": "https://client.example",
        "Access-Control-Request-Method": "POST"})
    assert private.status_code == 400
    r = await env.client.get("/oauth/authorize", params=[*params(client_id).items(), ("redirect_uri", "https://attacker.example")])
    assert r.status_code == 400
    r = await env.client.post("/oauth/token", content="client_id=a&client_id=b", headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 400
    r = await env.client.post("/oauth/register", content="x" * 16385, headers={"Content-Type": "application/json"})
    assert r.status_code == 413
