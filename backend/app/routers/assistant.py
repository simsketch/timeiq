"""The in-app assistant (dashboard home): one chat turn per request."""
from __future__ import annotations

import json
import logging
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted, require_session_auth
from app.database import get_db
from app.models.user import User
from app.services import assistant, llm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/me/assistant", tags=["assistant"])

MAX_MESSAGES = 60
MAX_BYTES = 60_000


class ChatIn(BaseModel):
    # Anthropic-format history from earlier turns (returned by this endpoint), ending with
    # the new user message.
    messages: list[dict[str, Any]] = Field(min_length=1)
    # The user's answer to tools the last reply held for confirmation.
    decision: Optional[Literal["confirm", "cancel"]] = None
    # The app shows a Confirm card for held tools (apps from before it don't send this).
    confirm_cards: bool = False


class ChatOut(BaseModel):
    messages: list[dict[str, Any]]
    reply: str
    steps: list[dict[str, Any]]
    # Tools waiting for the user's Confirm; the history then ends on their tool_use.
    pending: Optional[list[dict[str, Any]]] = None


def _held(message: dict[str, Any] | None) -> bool:
    """An assistant message whose tool calls are waiting for the user's answer."""
    return bool(message) and message.get("role") == "assistant" and isinstance(message.get("content"), list) and any(
        isinstance(b, dict) and b.get("type") == "tool_use" for b in message["content"])


@router.post("", response_model=ChatOut)
async def chat(
    payload: ChatIn,
    user: User = Depends(get_current_user_unrestricted),
    _session: None = Depends(require_session_auth),  # after user: it reads how they signed in
    db: AsyncSession = Depends(get_db),
):
    if not llm.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The assistant isn't set up yet.")
    messages = payload.messages[-MAX_MESSAGES:]
    # The trimmed history must start on a plain user turn, not halfway through a tool exchange.
    while messages and not (messages[0].get("role") == "user" and isinstance(messages[0].get("content"), str)):
        messages = messages[1:]
    last = messages[-1] if messages else None
    if payload.decision:
        if not _held(last):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "There's nothing waiting to confirm.")
        if payload.decision == "cancel":
            messages = assistant.cancelled(messages)
            return {"messages": messages, "reply": messages[-1]["content"][0]["text"], "steps": []}
    else:
        if not last or last.get("role") != "user" or not isinstance(last.get("content"), str) or not last["content"].strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "End with a message from you.")
        if len(messages) >= 2 and _held(messages[-2]):
            # They typed instead of pressing Confirm or Cancel: the held tools count as cancelled.
            messages = [*assistant.cancelled(messages[:-1])[:-1], last]
    if len(json.dumps(messages, default=str)) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "This conversation is too long. Start a new one.")
    turn = await assistant.start_turn(db, user)
    try:
        result = await assistant.chat(user, messages, confirmed=payload.decision == "confirm", cards=payload.confirm_cards)
    except Exception:
        logger.exception("Assistant turn failed for user %s", user.id)
        await db.delete(turn)  # a failed turn doesn't count against the limit
        await db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The assistant hit a problem. Try again in a moment.")
    usage = result.pop("usage")
    turn.input_tokens, turn.output_tokens, turn.model = usage["input_tokens"], usage["output_tokens"], usage["model"][:100]
    return result
