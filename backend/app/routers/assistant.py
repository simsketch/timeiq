"""The in-app assistant (dashboard home): one chat turn per request."""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user_unrestricted, require_session_auth
from app.config import settings
from app.models.user import User
from app.services import assistant

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/me/assistant", tags=["assistant"])

MAX_MESSAGES = 60
MAX_BYTES = 200_000


class ChatIn(BaseModel):
    # Anthropic-format history from earlier turns (returned by this endpoint), ending with
    # the new user message.
    messages: list[dict[str, Any]] = Field(min_length=1)


class ChatOut(BaseModel):
    messages: list[dict[str, Any]]
    reply: str
    steps: list[dict[str, Any]]


@router.post("", response_model=ChatOut)
async def chat(
    payload: ChatIn,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),  # after user: it reads how they signed in
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The assistant isn't set up yet.")
    messages = payload.messages[-MAX_MESSAGES:]
    # The trimmed history must start on a plain user turn, not halfway through a tool exchange.
    while messages and not (messages[0].get("role") == "user" and isinstance(messages[0].get("content"), str)):
        messages = messages[1:]
    last = messages[-1] if messages else None
    if not last or last.get("role") != "user" or not isinstance(last.get("content"), str) or not last["content"].strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "End with a message from you.")
    if len(json.dumps(messages, default=str)) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "This conversation is too long. Start a new one.")
    try:
        return await assistant.chat(user, messages)
    except Exception:
        logger.exception("Assistant turn failed for user %s", user.id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The assistant hit a problem. Try again in a moment.")
