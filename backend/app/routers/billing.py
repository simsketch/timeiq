from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted
from app.database import get_db
from app.models.user import User
from app.services import billing

logger = logging.getLogger(__name__)

router = APIRouter(tags=["billing"])


class PricingInfo(BaseModel):
    enabled: bool
    founder_price_cents: Optional[int]
    standard_price_cents: int
    currency: str
    founder_seats: int
    founder_seats_left: int


class BillingStatus(BaseModel):
    enabled: bool
    entitled: bool
    status: str
    plan: Optional[str]
    current_period_end: Optional[datetime]
    has_customer: bool


class UrlResponse(BaseModel):
    url: str


class ConfirmRequest(BaseModel):
    session_id: str


@router.get("/api/billing/pricing", response_model=PricingInfo)
async def pricing(db: AsyncSession = Depends(get_db)):
    return await billing.pricing_info(db)


@router.get("/api/billing/status", response_model=BillingStatus)
async def billing_status(user: User = Depends(get_current_user_unrestricted)):
    return billing.status_payload(user)


@router.post("/api/billing/checkout", response_model=UrlResponse)
async def checkout(
    user: User = Depends(get_current_user_unrestricted),
    db: AsyncSession = Depends(get_db),
):
    if not billing.enabled():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Billing is not configured")
    if user.subscription_status in billing.PAID_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already subscribed")
    try:
        url = await billing.create_checkout_session(user, db)
    except stripe.StripeError as exc:
        logger.error("Stripe checkout failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not start checkout")
    return {"url": url}


@router.post("/api/billing/confirm", response_model=BillingStatus)
async def confirm(
    data: ConfirmRequest,
    user: User = Depends(get_current_user_unrestricted),
    db: AsyncSession = Depends(get_db),
):
    if not billing.enabled():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Billing is not configured")
    try:
        await billing.confirm_checkout(user, data.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except stripe.StripeError as exc:
        logger.error("Stripe confirm failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not confirm checkout")
    await db.flush()
    return billing.status_payload(user)


@router.post("/api/billing/portal", response_model=UrlResponse)
async def portal(user: User = Depends(get_current_user_unrestricted)):
    if not billing.enabled():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Billing is not configured")
    if not user.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No billing account yet")
    try:
        url = billing.create_portal_session(user)
    except stripe.StripeError as exc:
        logger.error("Stripe portal failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not open billing portal")
    return {"url": url}


@router.post("/api/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        await billing.handle_webhook(payload, request.headers.get("stripe-signature"))
    except (ValueError, stripe.SignatureVerificationError) as exc:
        logger.warning("Rejected Stripe webhook: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook")
    return {"received": True}
