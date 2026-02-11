from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.availability_rule import AvailabilityRule
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.availability import (
    AvailabilityRuleBulkUpdate,
    AvailabilityRuleResponse,
    AvailableSlot,
)
from app.services.availability import get_available_slots

router = APIRouter(tags=["availability"])


@router.get(
    "/api/availability-rules",
    response_model=list[AvailabilityRuleResponse],
)
async def list_availability_rules(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all availability rules for the authenticated user."""
    result = await db.execute(
        select(AvailabilityRule)
        .where(AvailabilityRule.user_id == user.id)
        .order_by(AvailabilityRule.day_of_week)
    )
    return result.scalars().all()


@router.put(
    "/api/availability-rules",
    response_model=list[AvailabilityRuleResponse],
)
async def bulk_update_availability_rules(
    payload: AvailabilityRuleBulkUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Replace all availability rules for the authenticated user.
    Deletes existing rules and creates new ones from the payload.
    """
    # Validate: no duplicate days
    days = [r.day_of_week for r in payload.rules]
    if len(days) != len(set(days)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate day_of_week values are not allowed",
        )

    # Validate: start_time < end_time for each rule
    for rule in payload.rules:
        if rule.start_time >= rule.end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"start_time must be before end_time for day {rule.day_of_week}",
            )

    # Delete existing rules
    await db.execute(
        delete(AvailabilityRule).where(AvailabilityRule.user_id == user.id)
    )

    # Create new rules
    new_rules = []
    for rule_data in payload.rules:
        rule = AvailabilityRule(
            user_id=user.id,
            day_of_week=rule_data.day_of_week,
            start_time=rule_data.start_time,
            end_time=rule_data.end_time,
            is_active=rule_data.is_active,
        )
        db.add(rule)
        new_rules.append(rule)

    await db.flush()
    for rule in new_rules:
        await db.refresh(rule)

    return new_rules


@router.get(
    "/api/public/{username}/{event_slug}/slots",
    response_model=list[AvailableSlot],
)
async def get_public_slots(
    username: str,
    event_slug: str,
    date_str: str = Query(..., alias="date", description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint: Get available time slots for a specific user's event type on a given date.
    """
    # Look up the host user
    result = await db.execute(
        select(User).where(User.username == username)
    )
    host = result.scalar_one_or_none()
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Look up the event type
    result = await db.execute(
        select(EventType).where(
            and_(
                EventType.user_id == host.id,
                EventType.slug == event_slug,
                EventType.is_active.is_(True),
            )
        )
    )
    event_type = result.scalar_one_or_none()
    if event_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Parse the date
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD.",
        )

    slots = await get_available_slots(db, host, event_type, target_date)
    return [AvailableSlot(start=s) for s in slots]
