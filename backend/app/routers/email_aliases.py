"""Manage verified sender addresses; confirmation links work without sign-in."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.user_email_alias import UserEmailAlias
from app.services import email as mail, email_aliases as aliases

router = APIRouter(prefix="/api/email-aliases", tags=["email-aliases"])


class AliasIn(BaseModel):
    email: EmailStr


class AliasOut(BaseModel):
    id: uuid.UUID
    email: str
    verified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConfirmIn(BaseModel):
    token: str = Field(min_length=20, max_length=100)


async def _owned(db: AsyncSession, alias_id: uuid.UUID, user: User) -> UserEmailAlias:
    alias = await db.scalar(select(UserEmailAlias).where(
        UserEmailAlias.id == alias_id, UserEmailAlias.user_id == user.id
    ).with_for_update())
    if alias is None:
        raise HTTPException(404, "Address not found. Refresh your calendars and try again.")
    return alias


async def _available(db: AsyncSession, email: str) -> None:
    if await aliases.sender_user(db, email) is not None:
        raise HTTPException(409, "This address is already linked to an account. Use a different address.")


async def _send(db: AsyncSession, alias: UserEmailAlias, user: User) -> None:
    now = datetime.now(timezone.utc)
    if not await aliases.reserve_notice(db, f"verify:{alias.email}", now, timedelta(minutes=1)):
        raise HTTPException(429, "A confirmation email was sent recently. Wait a minute and try again.")
    token = aliases.issue_token(alias, now)
    await db.commit()
    mail.send_alias_confirmation(alias.email, token, user)


@router.get("", response_model=list[AliasOut])
async def list_aliases(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(UserEmailAlias).where(
        UserEmailAlias.user_id == user.id
    ).order_by(UserEmailAlias.created_at))).scalars().all()


@router.post("", response_model=AliasOut, status_code=201)
async def add_alias(data: AliasIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = str(data.email).strip().lower()
    if email.endswith("@" + settings.INBOUND_DOMAIN.lower()):
        raise HTTPException(400, "You can't link TimeIQ addresses. Add an address you send email from.")
    # Serialize the per-account limit, including concurrent adds.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    await _available(db, email)
    count = await db.scalar(select(func.count()).select_from(UserEmailAlias).where(UserEmailAlias.user_id == user.id))
    if count >= aliases.MAX_ALIASES:
        raise HTTPException(400, "You can link up to 10 addresses. Remove one before adding another.")
    alias = UserEmailAlias(user_id=user.id, email=email, verification_sent_at=datetime.now(timezone.utc))
    db.add(alias)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This address already has a confirmation pending. Use that link or remove the pending address.")
    await _send(db, alias, user)
    return alias


@router.post("/confirm", response_model=AliasOut)
async def confirm_alias(data: ConfirmIn, db: AsyncSession = Depends(get_db)):
    alias = await db.scalar(select(UserEmailAlias).where(
        UserEmailAlias.verify_token_hash == aliases.token_hash(data.token)
    ).with_for_update())
    if alias is None:
        raise HTTPException(400, "This confirmation link is invalid or already used. Request another from Calendars.")
    now = datetime.now(timezone.utc)
    if alias.verification_sent_at <= now - aliases.TOKEN_LIFETIME:
        raise HTTPException(400, "This confirmation link expired. Request another from Calendars.")
    await _available(db, alias.email)
    alias.verified_at, alias.verify_token_hash = now, None
    await db.flush()
    return alias


@router.post("/{alias_id}/resend", response_model=AliasOut)
async def resend_alias(alias_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alias = await _owned(db, alias_id, user)
    if alias.verified_at is not None:
        raise HTTPException(400, "This address is already verified. You can send email to the agent now.")
    await _available(db, alias.email)
    await _send(db, alias, user)
    return alias


@router.delete("/{alias_id}", status_code=204)
async def delete_alias(alias_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, alias_id, user))
