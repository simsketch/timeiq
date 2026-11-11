from argparse import Namespace
from copy import deepcopy
import json

import pytest

from scripts import meta_ads


@pytest.fixture
def creative(monkeypatch):
    monkeypatch.setattr(meta_ads, "PAGE", "page")
    return {
        "id": "old", "name": "TimeIQ original",
        "object_story_spec": {"page_id": "page", "link_data": {
            "image_hash": "original-image", "message": "Original copy", "name": "Original headline",
            "link": "https://timeiq.app/?utm_source=facebook&utm_content={{ad.name}}",
            "call_to_action": {"type": "SIGN_UP", "value": {"link": "https://timeiq.app/?utm_source=facebook&utm_content={{ad.name}}"}},
        }},
        "degrees_of_freedom_spec": {"creative_features_spec": {"text_optimizations": {"enroll_status": "OPT_OUT"}}},
        "url_tags": "existing=tracking",
    }


def test_signup_copy_preserves_assets_tracking_and_opt_outs(creative):
    before = deepcopy(creative)
    payload = meta_ads.signup_creative(creative)
    assert creative == before
    link = payload["object_story_spec"]["link_data"]
    assert link["link"] == link["call_to_action"]["value"]["link"] == "https://timeiq.app/sign-up?utm_source=facebook&utm_content={{ad.name}}"
    assert link["image_hash"] == "original-image"
    assert link["message"] == "Original copy"
    assert payload["degrees_of_freedom_spec"] == before["degrees_of_freedom_spec"]
    assert payload["url_tags"] == "existing=tracking"


@pytest.mark.parametrize("url", ["https://other.app/", "https://timeiq.app@other.app/", "http://timeiq.app/", "https://timeiq.app/book/private"])
def test_unexpected_destinations_fail_closed(creative, url):
    creative["object_story_spec"]["link_data"]["link"] = url
    with pytest.raises(SystemExit, match="unexpected ad destination"):
        meta_ads.signup_creative(creative)


@pytest.mark.parametrize("apply", [False, True])
def test_command_only_replaces_existing_signup_ad_creatives(creative, monkeypatch, tmp_path, apply):
    monkeypatch.setattr(meta_ads, "require_env", lambda: None)
    monkeypatch.setattr(meta_ads, "ACCOUNT", "act_account")
    campaign = {"id": meta_ads.CAMPAIGN_ID, "name": meta_ads.CAMPAIGN_NAME, "account_id": "account", "status": "ACTIVE", "daily_budget": "500"}
    adset = {"id": meta_ads.SIGNUP_ADSET_ID, "campaign_id": meta_ads.CAMPAIGN_ID, "status": "ACTIVE", "targeting": {"original": True}}
    ads = {key: {"id": key, "name": name, "campaign_id": meta_ads.CAMPAIGN_ID, "adset_id": meta_ads.SIGNUP_ADSET_ID, "status": "ACTIVE", "tracking_specs": [{"original": True}], "creative": deepcopy(creative)} for key, name in meta_ads.SIGNUP_ADS.items()}
    writes = []
    created = {}

    def call(method, path, **params):
        if method == "GET":
            if path == meta_ads.CAMPAIGN_ID:
                return deepcopy(campaign)
            if path == meta_ads.SIGNUP_ADSET_ID:
                return deepcopy(adset)
            return deepcopy(ads[path])
        writes.append((path, params))
        if path == "act_account/adcreatives":
            new_id = f"new-{len(created)}"
            created[new_id] = {"id": new_id, "object_story_spec": json.loads(params["object_story_spec"])}
            return {"id": new_id}
        assert path in meta_ads.SIGNUP_ADS
        assert set(params) == {"creative"}
        ads[path]["creative"] = created[json.loads(params["creative"])["creative_id"]]
        return {"success": True}

    monkeypatch.setattr(meta_ads, "call", call)
    path = tmp_path / "before.json"
    meta_ads.cmd_retarget_signup(Namespace(snapshot=str(path), apply=apply))
    snapshot = json.loads(path.read_text())
    assert snapshot["campaign"]["daily_budget"] == "500"
    assert all(ad["creative"]["id"] == "old" for ad in snapshot["ads"])
    assert len(writes) == (8 if apply else 0)
    assert not any("status" in params or "daily_budget" in params for _, params in writes)
    with pytest.raises(FileExistsError):
        meta_ads.cmd_retarget_signup(Namespace(snapshot=str(path), apply=False))
