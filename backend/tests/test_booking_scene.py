import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.routers.public import PublicUserProfile
from app.routers.users import BOOKING_SCENES, UserUpdate

REGISTRY = Path(__file__).resolve().parents[2] / "frontend/src/components/booking/scenes/types.ts"


def test_known_scenes_are_accepted():
    for scene in BOOKING_SCENES:
        assert UserUpdate(booking_scene=scene).booking_scene == scene


def test_unknown_scene_is_rejected():
    with pytest.raises(ValidationError, match="Unknown scene"):
        UserUpdate(booking_scene="police-box")


def test_scene_list_matches_the_frontend_registry():
    # The SceneId union in the frontend is the source of truth for what exists.
    union = re.search(r"export type SceneId = ([^;]+);", REGISTRY.read_text()).group(1)
    # Plus "none", a host's choice to show no scene at all.
    assert set(re.findall(r'"([a-z-]+)"', union)) | {"none"} == BOOKING_SCENES


def test_public_profile_carries_the_scene_and_defaults_to_none():
    base = {"username": "a", "name": None, "image_url": None, "event_types": []}
    assert PublicUserProfile(**base).booking_scene is None
    assert PublicUserProfile(**base, booking_scene="orrery").booking_scene == "orrery"
