"""Personal access tokens: create, verify, list, revoke.

A token is "tiq_" plus 43 URL-safe random characters (256 bits). Only its
SHA-256 is stored, so a database leak doesn't leak working tokens; lookups
hash the presented token and compare in the database.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_token import ApiToken
from app.models.user import User

PREFIX = "tiq_"
MAX_TOKENS_PER_USER = 20
# last_used_at is a hint for the Settings list, not an audit log: write it at
# most this often so busy MCP clients don't turn every call into an UPDATE.
_TOUCH_EVERY = timedelta(minutes=5)


def looks_like_token(value: str) -> bool:
    return value.startswith(PREFIX)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def create(db: AsyncSession, user: User, name: str) -> tuple[ApiToken, str]:
    """Create a token and return it with the raw value, which is never stored."""
    raw = PREFIX + secrets.token_urlsafe(32)
    token = ApiToken(user_id=user.id, name=name.strip()[:100] or "Token", token_hash=_hash(raw), prefix=raw[:8])
    db.add(token)
    await db.flush()
    return token, raw


async def user_for(db: AsyncSession, raw: str, now: datetime | None = None) -> User | None:
    """The owner of an active token, or None for an unknown or revoked one."""
    if not looks_like_token(raw) or len(raw) > 100:
        return None
    row = (
        await db.execute(
            select(ApiToken, User)
            .join(User, User.id == ApiToken.user_id)
            .where(ApiToken.token_hash == _hash(raw), ApiToken.revoked_at.is_(None))
        )
    ).first()
    if row is None:
        return None
    token, user = row
    now = now or datetime.now(timezone.utc)
    if token.last_used_at is None or now - token.last_used_at > _TOUCH_EVERY:
        token.last_used_at = now
        await db.commit()
    return user


async def active_for(db: AsyncSession, user: User) -> list[ApiToken]:
    return list(
        (
            await db.execute(
                select(ApiToken)
                .where(ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None))
                .order_by(ApiToken.created_at.desc())
            )
        ).scalars()
    )
