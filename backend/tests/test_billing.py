from types import SimpleNamespace

import pytest

from app.services import billing


def _user(status, plan=None):
    return SimpleNamespace(
        subscription_status=status, subscription_plan=plan,
        subscription_current_period_end=None, stripe_customer_id=None,
    )


@pytest.mark.parametrize("status,expected", [
    ("active", True), ("trialing", True), ("past_due", True), ("complimentary", True),
    ("none", False), ("canceled", False), ("unpaid", False), ("incomplete", False),
])
def test_is_entitled(status, expected):
    assert billing.is_entitled(_user(status)) is expected


def test_plan_for_price(monkeypatch):
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_FOUNDER", "price_f")
    assert billing.plan_for_price("price_f") == "founder"
    assert billing.plan_for_price("price_other") == "standard"
    assert billing.plan_for_price(None) == "standard"


def test_apply_subscription_maps_fields(monkeypatch):
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_FOUNDER", "price_f")
    user = SimpleNamespace(
        stripe_customer_id=None, stripe_subscription_id=None,
        subscription_status="none", subscription_plan=None,
        subscription_current_period_end=None,
    )
    sub = {
        "id": "sub_1", "status": "active", "customer": "cus_1",
        "items": {"data": [{"price": {"id": "price_f"}, "current_period_end": 1_800_000_000}]},
    }
    billing.apply_subscription(user, sub)
    assert user.stripe_subscription_id == "sub_1"
    assert user.stripe_customer_id == "cus_1"
    assert user.subscription_status == "active"
    assert user.subscription_plan == "founder"
    assert user.subscription_current_period_end.year == 2027


def test_status_payload_when_disabled(monkeypatch):
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "")
    payload = billing.status_payload(_user("none"))
    assert payload["enabled"] is False and payload["entitled"] is True


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(monkeypatch):
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_x")
    with pytest.raises(Exception):
        await billing.handle_webhook(b"{}", "t=1,v1=bad")
