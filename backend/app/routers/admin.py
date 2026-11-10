"""Owner-only, read-only application analytics."""
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted, require_session_auth
from app.config import settings
from app.database import get_db
from app.models import Booking, CalendarSource, EmailImport, EventType, GroupMeeting, User

ADMIN_EMAIL = "simsketch@gmail.com"
router = APIRouter(prefix="/api/admin", tags=["admin"])


async def require_admin(request: Request, user: User = Depends(get_current_user_unrestricted)):
    require_session_auth(request)
    # Recheck Clerk: a stored email may be stale, and an unverified email is not ownership.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"https://api.clerk.com/v1/users/{user.clerk_id}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
    except httpx.HTTPError:
        raise HTTPException(503, "Could not verify admin access. Please try again.") from None
    if response.status_code != 200:
        raise HTTPException(503, "Could not verify admin access. Please try again.")
    profile = response.json()
    allowed = any(
        email.get("email_address", "").lower() == ADMIN_EMAIL
        and email.get("verification", {}).get("status") == "verified"
        and email.get("id") == profile.get("primary_email_address_id")
        for email in profile.get("email_addresses", [])
    )
    if not allowed:
        raise HTTPException(403, "Admin access is restricted to the owner.")
    return user


@router.get("/analytics", dependencies=[Depends(require_admin)])
async def analytics(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    async def count(model, *conditions):
        return await db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0

    users = (await db.execute(select(
        func.count().label("total"),
        func.count().filter(User.created_at >= now - timedelta(days=1)).label("last_24h"),
        func.count().filter(User.created_at >= now - timedelta(days=7)).label("last_7d"),
        func.count().filter(User.created_at >= now - timedelta(days=30)).label("last_30d"),
        func.count().filter(User.subscription_status == "active").label("active_subscriptions"),
        func.count().filter(User.subscription_status == "trialing").label("trials"),
        func.count().filter(User.subscription_status == "complimentary").label("complimentary"),
    ))).mappings().one()
    signup_day = func.date(func.timezone("UTC", User.created_at)).label("signup_day")
    daily = dict((await db.execute(select(signup_day, func.count()).where(
        User.created_at >= today - timedelta(days=29)
    ).group_by(signup_day))).all())
    recent = (await db.execute(select(
        User.name, User.email, User.username, User.created_at, User.subscription_status
    ).order_by(User.created_at.desc()).limit(50))).mappings().all()
    calendars = (CalendarSource.is_active.is_(True), CalendarSource.type.not_in(("email", "meetings")))
    return {
        "generated_at": now,
        "users": dict(users),
        "signups": [{"date": (today - timedelta(days=i)).date(), "count": daily.get((today - timedelta(days=i)).date(), 0)} for i in reversed(range(30))],
        "activity": {
            "connected_calendars": await count(CalendarSource, *calendars),
            "users_with_calendars": await db.scalar(select(func.count(func.distinct(CalendarSource.user_id))).where(*calendars)) or 0,
            "calendars_needing_attention": await count(CalendarSource, *calendars, CalendarSource.sync_status != "ok"),
            "active_booking_types": await count(EventType, EventType.is_active.is_(True)),
            "bookings": await count(Booking),
            "bookings_30d": await count(Booking, Booking.created_at >= now - timedelta(days=30)),
            "upcoming_bookings": await count(Booking, Booking.status == "confirmed", Booking.starts_at > now),
            "cc_agent_meetings": await count(GroupMeeting, GroupMeeting.source == "email"),
            "cc_agent_booked": await count(GroupMeeting, GroupMeeting.source == "email", GroupMeeting.status == "booked"),
            "email_imports_30d": await count(EmailImport, EmailImport.created_at >= now - timedelta(days=30)),
            "email_failures_30d": await count(EmailImport, EmailImport.created_at >= now - timedelta(days=30), EmailImport.status == "failed"),
        },
        "recent_users": [dict(row) for row in recent],
    }
