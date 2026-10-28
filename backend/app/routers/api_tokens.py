"""Personal access tokens: Settings → API tokens."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted, require_session_auth
from app.database import get_db
from app.models.api_token import ApiToken
from app.models.user import User
from app.services import api_tokens

router = APIRouter(prefix="/api/me/tokens", tags=["api-tokens"])


class TokenOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TokenCreated(TokenOut):
    # The full token, shown once.
    token: str


# Token management is session-only (require_session_auth): a token can't mint
# or revoke tokens. Listing works without a subscription so people can always
# see and revoke what they've issued.
@router.get("", response_model=list[TokenOut])
async def list_tokens(
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    return await api_tokens.active_for(db, user)


@router.post("", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(
    data: TokenCreate,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    if len(await api_tokens.active_for(db, user)) >= api_tokens.MAX_TOKENS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can have up to {api_tokens.MAX_TOKENS_PER_USER} tokens. Revoke one you no longer use.",
        )
    token, raw = await api_tokens.create(db, user, data.name)
    await db.commit()
    await db.refresh(token)
    return TokenCreated(**TokenOut.model_validate(token).model_dump(), token=raw)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),
    db: AsyncSession = Depends(get_db),
):
    token = await db.get(ApiToken, token_id)
    if token is None or token.user_id != user.id or token.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    token.revoked_at = datetime.now(timezone.utc)
    await db.commit()
