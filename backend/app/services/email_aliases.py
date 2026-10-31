"""Verified addresses allowed to send commands to the shared agent inbox."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_email_alias import EmailAddressNotice, UserEmailAlias

TOKEN_LIFETIME = timedelta(days=7)
MAX_ALIASES = 10


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def sender_user(db: AsyncSession, email: str) -> User | None:
    account = (await db.execute(select(User).where(func.lower(User.email) == email.lower()))).scalars().first()
    if account is not None:
        return account
    return (await db.execute(
        select(User).join(UserEmailAlias, UserEmailAlias.user_id == User.id).where(
            UserEmailAlias.email == email.lower(), UserEmailAlias.verified_at.is_not(None)
        )
    )).scalar_one_or_none()


async def owner_addresses(db: AsyncSession, owner: User) -> set[str]:
    aliases = (await db.execute(select(UserEmailAlias.email).where(
        UserEmailAlias.user_id == owner.id, UserEmailAlias.verified_at.is_not(None)
    ))).scalars().all()
    return {(owner.email or "").lower(), *aliases}


async def reserve_notice(db: AsyncSession, key: str, now: datetime, cooldown: timedelta) -> bool:
    """Reserve before sending, so concurrent deliveries can only send once."""
    won = await db.scalar(pg_insert(EmailAddressNotice).values(key=key, sent_at=now).on_conflict_do_update(
        index_elements=["key"], set_={"sent_at": now}, where=EmailAddressNotice.sent_at <= now - cooldown,
    ).returning(EmailAddressNotice.key))
    return won is not None


def issue_token(alias: UserEmailAlias, now: datetime | None = None) -> str:
    token = secrets.token_urlsafe(32)
    alias.verify_token_hash = token_hash(token)
    alias.verification_sent_at = now or datetime.now(timezone.utc)
    return token
