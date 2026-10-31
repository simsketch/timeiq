"""Email a schedule in: the Resend webhook, your address, import history and undo."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.email_import import EmailImport
from app.models.user import User
from app.services import email_import

logger = logging.getLogger(__name__)

router = APIRouter(tags=["email-imports"])


class ImportOut(BaseModel):
    id: uuid.UUID
    sender: Optional[str]
    subject: Optional[str]
    status: str
    event_count: int
    error: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class InboxOut(BaseModel):
    address: str
    agent_address: str
    account_email: str
    enabled: bool
    imports: list[ImportOut]


class UndoByToken(BaseModel):
    token: str


class UndoResult(BaseModel):
    removed: int
    subject: Optional[str]
    status: str


def _enabled() -> bool:
    return bool(settings.RESEND_INBOUND_API_KEY and settings.RESEND_INBOUND_WEBHOOK_SECRET and settings.ANTHROPIC_API_KEY)


@router.post("/api/webhooks/inbound-email")
async def inbound_email(request: Request):
    from svix.webhooks import Webhook, WebhookVerificationError  # slow to import

    body = await request.body()
    try:
        Webhook(settings.RESEND_INBOUND_WEBHOOK_SECRET).verify(body, dict(request.headers))
        # verify() only checks the signature in current svix (it returns None), so parse the body here.
        payload = json.loads(body)
    except (WebhookVerificationError, ValueError):
        logger.warning("Inbound email webhook failed signature verification")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")
    if payload.get("type") != "email.received":
        return {"received": True}
    record = await email_import.process_inbound(payload)
    if record is not None and (record.retryable or record.status == "processing"):
        # A temporary failure, or another delivery still working on it: a
        # non-2xx makes Resend redeliver, and the redelivery picks it up.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Try again later")
    return {"received": True, "status": record.status if record else "ignored"}


async def _inbox(db: AsyncSession, user: User) -> dict:
    address = email_import.address_for(user)
    await db.flush()
    imports = (
        await db.execute(
            select(EmailImport)
            .where(EmailImport.user_id == user.id)
            .order_by(EmailImport.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    return {"address": address, "agent_address": email_import.agent_address(), "account_email": user.email,
            "enabled": _enabled(), "imports": imports}


@router.get("/api/email-imports", response_model=InboxOut)
async def list_imports(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _inbox(db, user)


@router.post("/api/email-imports/address", response_model=InboxOut)
async def new_address(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Replace the address; the old one stops working."""
    user.inbound_token = email_import.new_token()
    return await _inbox(db, user)


class TextImportIn(BaseModel):
    text: str
    name: Optional[str] = None


class ImportedEvent(BaseModel):
    title: str
    starts_at: datetime
    ends_at: datetime
    is_all_day: bool


class TextImportOut(BaseModel):
    id: uuid.UUID
    status: str
    name: Optional[str]
    events: list[ImportedEvent]


@router.post("/api/email-imports/text", response_model=TextImportOut, status_code=status.HTTP_201_CREATED)
async def import_text(data: TextImportIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Import a schedule from pasted text into the "From email" calendar (undo as usual)."""
    try:
        record, rows = await email_import.import_text(db, user, data.text, data.name)
    except email_import.ImportRejected as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"id": record.id, "status": record.status, "name": record.subject, "events": rows}


@router.post("/api/email-imports/{import_id}/undo", response_model=UndoResult)
async def undo_import(import_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await db.get(EmailImport, import_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import not found")
    removed = await email_import.undo(db, record)
    return {"removed": removed, "subject": record.subject, "status": record.status}


@router.post("/api/email-imports/undo-by-token", response_model=UndoResult)
async def undo_by_token(data: UndoByToken, db: AsyncSession = Depends(get_db)):
    """The Undo link in the reply email (no sign-in; the token is the credential)."""
    record = (
        await db.execute(select(EmailImport).where(EmailImport.undo_token == data.token))
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That undo link isn't valid")
    removed = await email_import.undo(db, record)
    return {"removed": removed, "subject": record.subject, "status": record.status}
