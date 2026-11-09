import base64
import io
import re

import pytest
from PIL import Image
from pydantic import ValidationError

from app.routers.users import UserUpdate
from app.config import settings
from tests.test_qa_db_races import env  # noqa: F401

local_db = pytest.mark.skipif(not re.search(r"@localhost:5432/timeiq_qa\w*$", settings.async_database_url), reason="needs a local timeiq_qa database")


def logo(width=8, height=4):
    out = io.BytesIO()
    Image.new("RGBA", (width, height), (12, 40, 80, 255)).save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


def test_logo_validation_accepts_png_and_explicit_removal():
    value = logo()
    assert UserUpdate(booking_logo=value).booking_logo == value
    assert UserUpdate(booking_logo=None).booking_logo is None


@pytest.mark.parametrize("value", [
    "https://example.com/logo.png", "data:image/svg+xml,<svg/>", "data:image/png;base64,%%%",
    "data:image/png;base64," + base64.b64encode(b"not an image").decode(),
    "data:image/png;base64," + base64.b64encode(b"x" * (128 * 1024 + 1)).decode(),
])
def test_logo_validation_rejects_untrusted_or_oversized_uploads(value):
    with pytest.raises(ValidationError):
        UserUpdate(booking_logo=value)


def test_logo_dimensions_are_bounded():
    with pytest.raises(ValidationError, match="1024"):
        UserUpdate(booking_logo=logo(1025, 1))


@local_db
async def test_branding_is_saved_public_on_both_booking_pages_and_isolated_by_account(env):
    owner = env.users[0]
    value = logo()
    event = await env.client.post("/api/event-types", json={"name": "Brand demo", "duration_minutes": 30})
    assert event.status_code == 201, event.text
    slug = event.json()["slug"]
    result = await env.client.patch("/api/me", json={"booking_logo": value, "booking_white_label": True})
    assert result.status_code == 200, result.text
    assert result.json()["booking_logo"] == value
    assert result.json()["booking_white_label"] is True
    for path in [f"/api/public/{owner.username}", f"/api/public/{owner.username}/{slug}"]:
        result = await env.client.get(path)
        assert result.status_code == 200, result.text
        assert result.json()["booking_logo"] == value
        assert result.json()["booking_white_label"] is True
    env.as_user(env.users[1])
    other = (await env.client.get("/api/me")).json()
    assert other["booking_logo"] is None and other["booking_white_label"] is False
    env.as_user(owner)
    # Other profile edits preserve branding; an explicit null removes the logo.
    result = await env.client.patch("/api/me", json={"name": "Renamed"})
    assert result.json()["booking_logo"] == value
    result = await env.client.patch("/api/me", json={"booking_logo": None, "booking_white_label": False})
    assert result.json()["booking_logo"] is None and result.json()["booking_white_label"] is False


@local_db
async def test_invalid_upload_does_not_change_existing_branding(env):
    value = logo()
    await env.client.patch("/api/me", json={"booking_logo": value})
    result = await env.client.patch("/api/me", json={"booking_logo": "data:image/svg+xml,<svg/>"})
    assert result.status_code == 422
    assert (await env.client.get("/api/me")).json()["booking_logo"] == value
