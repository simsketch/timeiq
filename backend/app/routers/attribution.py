from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted, require_session_auth
from app.database import get_db
from app.models.user import User

router = APIRouter(tags=["users"])


class SignupAttribution(BaseModel):
    utm_source: str = Field(min_length=1, max_length=160)
    utm_medium: str | None = Field(default=None, max_length=160)
    utm_campaign: str | None = Field(default=None, max_length=160)
    utm_content: str | None = Field(default=None, max_length=160)
    utm_term: str | None = Field(default=None, max_length=160)
    ad_id: str | None = Field(default=None, pattern=r"^\d{1,64}$")
    captured_at: datetime


@router.post("/api/me/attribution")
async def record_attribution(
    payload: SignupAttribution, request: Request,
    user: User = Depends(get_current_user_unrestricted), db: AsyncSession = Depends(get_db),
):
    require_session_auth(request)
    now = datetime.now(timezone.utc)
    captured = payload.captured_at
    if captured.tzinfo is None or not user.created_at - timedelta(days=30) <= captured <= min(now, user.created_at + timedelta(minutes=15)):
        return {"recorded": False}
    # One atomic first-write: later logins, ad clicks or retried requests cannot relabel a user.
    result = await db.execute(update(User).where(
        User.id == user.id, User.signup_attribution.is_(None), User.created_at >= now - timedelta(days=1),
    ).values(signup_attribution=payload.model_dump(mode="json", exclude_none=True)).returning(User.id))
    return {"recorded": result.scalar_one_or_none() is not None}
