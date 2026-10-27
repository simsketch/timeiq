"""Both svix-signed webhooks accept a correctly signed body and reject a bad
signature, on the installed svix (whose verify() returns None in 2.x)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import httpx
import pytest

from app.config import settings
from app.main import app
from app.services import email_import

SECRET_BYTES = b"timeiq-test-secret-bytes"
SECRET = "whsec_" + base64.b64encode(SECRET_BYTES).decode()


def signed(body: bytes, good: bool = True) -> dict:
    mid, ts = "msg_test", str(int(time.time()))
    sig = base64.b64encode(hmac.new(SECRET_BYTES, f"{mid}.{ts}.".encode() + body, hashlib.sha256).digest()).decode()
    if not good:
        sig = sig[::-1]
    return {"svix-id": mid, "svix-timestamp": ts, "svix-signature": f"v1,{sig}", "content-type": "application/json"}


@pytest.fixture
async def client(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_INBOUND_WEBHOOK_SECRET", SECRET)
    monkeypatch.setattr(settings, "CLERK_WEBHOOK_SECRET", SECRET)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_inbound_email_webhook_parses_signed_body(client, monkeypatch):
    seen = []

    async def fake_process(payload, now=None):
        seen.append(payload)
        return None

    monkeypatch.setattr(email_import, "process_inbound", fake_process)
    body = json.dumps({"type": "email.received", "data": {"email_id": "e1"}}).encode()
    r = await client.post("/api/webhooks/inbound-email", content=body, headers=signed(body))
    assert r.status_code == 200, r.text
    assert seen and seen[0]["data"]["email_id"] == "e1"
    bad = await client.post("/api/webhooks/inbound-email", content=body, headers=signed(body, good=False))
    assert bad.status_code == 400


async def test_clerk_webhook_parses_signed_body(client):
    body = json.dumps({"type": "session.created", "data": {}}).encode()
    r = await client.post("/api/webhooks/clerk", content=body, headers=signed(body))
    assert r.status_code == 200, r.text
    bad = await client.post("/api/webhooks/clerk", content=body, headers=signed(body, good=False))
    assert bad.status_code == 400
