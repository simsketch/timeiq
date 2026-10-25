"""Unit regressions for QA-003/004/030/031/033/034 (no database needed)."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest
import stripe
from fastapi import HTTPException
from pydantic import ValidationError

from app.routers import cron, webhooks
from app.routers.timesheet_rows import RowUpdate
from app.routers.users import UserUpdate
from app.schemas.client import ClientUpdate
from app.schemas.invoice import ExpenseLineUpdate, InvoiceUpdate
from app.schemas.time_entry import TimeEntryUpdate
from app.services import billing
from app.services.invoice_pdf import _markup, build_invoice_pdf


# QA-033 ---------------------------------------------------------------------

def test_empty_cron_secret_rejects_everything(monkeypatch):
    monkeypatch.setattr(cron.settings, "CRON_SECRET", "")
    for header in ("Bearer ", "Bearer", ""):
        with pytest.raises(HTTPException) as exc:
            cron._require_cron_secret(header)
        assert exc.value.status_code == 401


def test_cron_secret_must_match(monkeypatch):
    monkeypatch.setattr(cron.settings, "CRON_SECRET", "s3cret")
    with pytest.raises(HTTPException):
        cron._require_cron_secret("Bearer wrong")
    cron._require_cron_secret("Bearer s3cret")  # no exception


# QA-031 ---------------------------------------------------------------------

@pytest.mark.parametrize("model,field", [
    (ClientUpdate, "hourly_rate"), (ClientUpdate, "name"), (ClientUpdate, "currency"),
    (TimeEntryUpdate, "hours"), (TimeEntryUpdate, "entry_date"), (TimeEntryUpdate, "client_id"),
    (InvoiceUpdate, "due_date"), (InvoiceUpdate, "show_weekly_breakdown"),
    (ExpenseLineUpdate, "amount"), (RowUpdate, "description"),
])
def test_explicit_null_for_required_field_is_rejected(model, field):
    with pytest.raises(ValidationError) as exc:
        model.model_validate({field: None})
    assert exc.value.errors()[0]["loc"] == (field,)


def test_nullable_fields_still_clear_and_omitted_fields_pass():
    assert ClientUpdate.model_validate({"contact_name": None}).model_dump(exclude_unset=True) == {"contact_name": None}
    assert InvoiceUpdate.model_validate({"notes": None}).notes is None
    assert TimeEntryUpdate.model_validate({}).model_dump(exclude_unset=True) == {}


def test_overlong_username_is_a_validation_error():
    with pytest.raises(ValidationError):
        UserUpdate(username="a" * 101)
    assert UserUpdate(username="a" * 100).username


# QA-030 ---------------------------------------------------------------------

def _fake_session(user):
    class Result:
        def scalar_one_or_none(self):
            return user

    class Session:
        async def execute(self, *_a, **_k):
            return Result()

        async def commit(self):
            pass

    @asynccontextmanager
    async def factory():
        yield Session()

    return factory


@pytest.mark.parametrize("local_name,expected", [("My business", "My business"), (None, "Clerk Name")])
async def test_clerk_update_keeps_name_set_in_timeiq(monkeypatch, local_name, expected):
    user = NS(email="a@example.com", name=local_name, image_url=None, username="a")
    monkeypatch.setattr(webhooks, "async_session", _fake_session(user))
    await webhooks._handle_user_updated({
        "id": "user_1", "first_name": "Clerk", "last_name": "Name",
        "email_addresses": [], "primary_email_address_id": None,
    })
    assert user.name == expected


# QA-004 ---------------------------------------------------------------------

def _sub(sid, status, created):
    return {"id": sid, "status": status, "created": created, "customer": "cus_1",
            "items": {"data": [{"price": {"id": "price_x"}, "current_period_end": 1_800_000_000}]}}


def _user(sub_id, status):
    return NS(stripe_subscription_id=sub_id, subscription_status=status, stripe_customer_id="cus_1")


def test_old_subscription_cancel_is_ignored_while_newer_one_is_active(monkeypatch):
    old, new = _sub("sub_old", "canceled", 1), _sub("sub_new", "active", 2)
    monkeypatch.setattr(stripe.Subscription, "list", lambda **kw: {"data": [old, new]})
    assert billing._subscription_to_apply(_user("sub_new", "active"), old) is None


def test_cancel_of_other_subscription_applies_when_nothing_else_is_active(monkeypatch):
    old, new = _sub("sub_old", "canceled", 1), _sub("sub_new", "canceled", 2)
    monkeypatch.setattr(stripe.Subscription, "list", lambda **kw: {"data": [old, new]})
    assert billing._subscription_to_apply(_user("sub_new", "active"), old)["id"] == "sub_old"


def test_newer_active_subscription_replaces_tracked_one(monkeypatch):
    old, new = _sub("sub_old", "canceled", 1), _sub("sub_new", "active", 2)
    monkeypatch.setattr(stripe.Subscription, "list", lambda **kw: {"data": [old, new]})
    assert billing._subscription_to_apply(_user("sub_old", "canceled"), new)["id"] == "sub_new"


def test_event_for_tracked_subscription_always_applies(monkeypatch):
    def boom(**kw):
        raise AssertionError("no lookup needed")
    monkeypatch.setattr(stripe.Subscription, "list", boom)
    sub = _sub("sub_1", "canceled", 1)
    assert billing._subscription_to_apply(_user("sub_1", "active"), sub) is sub


def test_stripe_outage_keeps_current_entitlement(monkeypatch):
    def down(**kw):
        raise stripe.APIConnectionError("down")
    monkeypatch.setattr(stripe.Subscription, "list", down)
    assert billing._subscription_to_apply(_user("sub_new", "active"), _sub("sub_old", "canceled", 1)) is None


# QA-003 ---------------------------------------------------------------------

def test_cancel_subscription_treats_missing_as_done(monkeypatch):
    def missing(sid):
        raise stripe.InvalidRequestError("No such subscription", "id", code="resource_missing")
    monkeypatch.setattr(stripe.Subscription, "cancel", missing)
    billing.cancel_subscription("sub_gone")


def test_cancel_subscription_treats_already_canceled_as_done(monkeypatch):
    def invalid(sid):
        raise stripe.InvalidRequestError("already canceled", None)
    monkeypatch.setattr(stripe.Subscription, "cancel", invalid)
    monkeypatch.setattr(stripe.Subscription, "retrieve", lambda sid: {"status": "canceled"})
    billing.cancel_subscription("sub_done")


def test_cancel_subscription_raises_on_outage(monkeypatch):
    def down(sid):
        raise stripe.APIConnectionError("down")
    monkeypatch.setattr(stripe.Subscription, "cancel", down)
    with pytest.raises(stripe.APIConnectionError):
        billing.cancel_subscription("sub_live")


# QA-034 ---------------------------------------------------------------------

def test_cjk_runs_get_a_cid_font_and_latin_stays_helvetica():
    assert _markup("Acme <b>") == "Acme &lt;b&gt;"
    assert _markup("山田 花子") == '<font name="STSong-Light">山田</font> <font name="STSong-Light">花子</font>'
    assert "HeiseiKakuGo-W5" in _markup("すずき 東京")
    assert "HYGothic-Medium" in _markup("주식회사")
    assert _markup("café €5") == "café €5"


def test_cjk_invoice_pdf_references_cid_fonts():
    invoice = NS(
        number="INV-1", issue_date=date(2026, 10, 25), due_date=date(2026, 11, 24),
        period_start=date(2026, 10, 1), period_end=date(2026, 10, 31),
        client_name="客户公司", client_contact_name="佐藤 太郎", client_address="東京都",
        client_billing_email="c@example.com", hourly_rate=Decimal("100"), currency="USD",
        subtotal=Decimal("100"), notes=None, show_weekly_breakdown=False,
        lines=[NS(id=uuid.uuid4(), kind="time", line_date=date(2026, 10, 2), description="咨询服务",
                  hours=Decimal("1"), rate=Decimal("100"), amount=Decimal("100"))],
    )
    pdf = build_invoice_pdf(invoice, "山田 花子", "s@example.com")
    assert pdf.startswith(b"%PDF") and b"STSong-Light" in pdf
