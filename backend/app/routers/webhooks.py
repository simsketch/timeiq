from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.user import User
from app.services.email import send_welcome

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _derive_username(email: str) -> str:
    """Derive a username from an email address."""
    prefix = email.split("@")[0]
    # Remove non-alphanumeric characters except hyphens and underscores
    username = re.sub(r"[^a-zA-Z0-9_-]", "", prefix).lower()
    if not username:
        username = "user"
    return username


async def _ensure_unique_username(username: str) -> str:
    """Ensure the username is unique by appending a number suffix if needed."""
    base = username
    suffix = 0
    async with async_session() as db:
        while True:
            candidate = f"{base}{suffix}" if suffix > 0 else base
            result = await db.execute(
                select(User).where(User.username == candidate)
            )
            if result.scalar_one_or_none() is None:
                return candidate
            suffix += 1


@router.post("/clerk")
async def clerk_webhook(request: Request):
    """
    Handle Clerk webhook events.
    Verifies the webhook signature using svix, then processes user.created and user.updated events.
    """
    # Get headers for verification
    headers = dict(request.headers)
    body = await request.body()

    from svix.webhooks import Webhook, WebhookVerificationError  # slow to import

    # Verify the webhook signature
    try:
        wh = Webhook(settings.CLERK_WEBHOOK_SECRET)
        wh.verify(body, headers)
        # svix 2 only checks the signature (verify() returns None); parse the body here.
        payload = json.loads(body)
    except (WebhookVerificationError, ValueError):
        logger.warning("Clerk webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        )

    event_type = payload.get("type")
    data = payload.get("data", {})

    if event_type == "user.created":
        await _handle_user_created(data)
    elif event_type == "user.updated":
        await _handle_user_updated(data)
    elif event_type == "user.deleted":
        await _handle_user_deleted(data)

    return {"status": "ok"}


async def _handle_user_created(data: dict) -> None:
    """Create a new User record from Clerk user.created event data."""
    clerk_id = data.get("id")
    if not clerk_id:
        logger.error("user.created event missing id")
        return

    email_addresses = data.get("email_addresses", [])
    primary_email_id = data.get("primary_email_address_id")
    email = ""
    for ea in email_addresses:
        if ea.get("id") == primary_email_id:
            email = ea.get("email_address", "")
            break
    if not email and email_addresses:
        email = email_addresses[0].get("email_address", "")

    first_name = data.get("first_name") or ""
    last_name = data.get("last_name") or ""
    name = f"{first_name} {last_name}".strip() or None

    image_url = data.get("image_url")

    # Derive username from Clerk username or email
    clerk_username = data.get("username")
    if clerk_username:
        username = clerk_username.lower()
    else:
        username = _derive_username(email)

    username = await _ensure_unique_username(username)

    async with async_session() as db:
        # Check if user already exists
        result = await db.execute(
            select(User).where(User.clerk_id == clerk_id)
        )
        if result.scalar_one_or_none() is not None:
            logger.info(f"User with clerk_id {clerk_id} already exists, skipping")
            return

        user = User(
            clerk_id=clerk_id,
            email=email,
            name=name,
            username=username,
            image_url=image_url,
        )
        db.add(user)
        await db.commit()
        logger.info(f"Created user {username} (clerk_id={clerk_id})")
    send_welcome(user)


async def _handle_user_updated(data: dict) -> None:
    """Update an existing User record from Clerk user.updated event data."""
    clerk_id = data.get("id")
    if not clerk_id:
        return

    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.clerk_id == clerk_id)
        )
        user = result.scalar_one_or_none()
        if user is None:
            logger.warning(f"user.updated: no user found for clerk_id {clerk_id}")
            # Create the user if they don't exist
            await _handle_user_created(data)
            return

        email_addresses = data.get("email_addresses", [])
        primary_email_id = data.get("primary_email_address_id")
        for ea in email_addresses:
            if ea.get("id") == primary_email_id:
                user.email = ea.get("email_address", user.email)
                break

        first_name = data.get("first_name") or ""
        last_name = data.get("last_name") or ""
        name = f"{first_name} {last_name}".strip()
        # The display name is editable in TimeIQ Settings (it appears on booking
        # pages and invoices), so Clerk only fills it in when none is set yet,
        # the same rule /api/me/sync follows.
        if name and not user.name:
            user.name = name

        image_url = data.get("image_url")
        if image_url is not None:
            user.image_url = image_url

        # Update username if Clerk has one set
        clerk_username = data.get("username")
        if clerk_username and clerk_username.lower() != user.username:
            new_username = clerk_username.lower()
            # Check uniqueness
            existing = await db.execute(
                select(User).where(User.username == new_username)
            )
            if existing.scalar_one_or_none() is None:
                user.username = new_username

        await db.commit()
        logger.info(f"Updated user {user.username} (clerk_id={clerk_id})")


async def _handle_user_deleted(data: dict) -> None:
    """Handle user.deleted event: cancel billing, then delete our rows.

    Same order as DELETE /api/me. If Stripe can't cancel the subscription the
    user is kept and the webhook answers 502, so Clerk redelivers it and the
    cancellation is retried instead of the subscription charging on unseen.
    """
    from app.services import billing, booking_payments

    clerk_id = data.get("id")
    if not clerk_id:
        return

    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.clerk_id == clerk_id)
        )
        user = result.scalar_one_or_none()
        if user:
            # A Stripe failure raises 502, so Clerk redelivers and we retry.
            await booking_payments.cancel_upcoming_bookings(db, user)
            try:
                billing.cancel_before_account_deletion(user)
            except Exception as exc:
                logger.error("Stripe cancel for deleted Clerk user %s failed: %s", clerk_id, exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not cancel the subscription; retry later",
                )
            await db.delete(user)
            await db.commit()
            logger.info(f"Deleted user (clerk_id={clerk_id})")
