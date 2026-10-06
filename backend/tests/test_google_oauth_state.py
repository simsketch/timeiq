import uuid

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers.google_auth import make_state, read_state


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-secret")


def test_round_trip_in_the_browser_that_started_it():
    uid = uuid.uuid4()
    assert read_state(make_state(uid, "n1"), "n1") == uid


def test_attacker_link_fails_in_victim_browser():
    # The attacker's own valid state, opened by a victim with no matching cookie.
    state = make_state(uuid.uuid4(), "attacker-nonce")
    with pytest.raises(HTTPException):
        read_state(state, None)
    with pytest.raises(HTTPException):
        read_state(state, "victim-nonce")


def test_tampered_user_id_rejected():
    state = make_state(uuid.uuid4(), "n1")
    forged = str(uuid.uuid4()) + state[36:]
    with pytest.raises(HTTPException):
        read_state(forged, "n1")


def test_bare_user_id_state_rejected():
    with pytest.raises(HTTPException):
        read_state(str(uuid.uuid4()), "n1")


def test_expired_state_rejected():
    state = make_state(uuid.uuid4(), "n1", now=1_000)
    with pytest.raises(HTTPException):
        read_state(state, "n1", now=1_000 + 601)
