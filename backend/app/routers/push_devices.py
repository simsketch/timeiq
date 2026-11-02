"""The TimeIQ app registers its push token here after sign-in."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_unrestricted
from app.database import get_db
from app.models.push_device import PushDevice
from app.models.user import User
from app.services.push import is_expo_token

router = APIRouter(prefix="/api/me/push-devices", tags=["push"])


class DeviceIn(BaseModel):
    token: str = Field(..., min_length=10, max_length=255)
    platform: Literal["ios", "android"]


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def register_device(data: DeviceIn, user: User = Depends(get_current_user_unrestricted), db: AsyncSession = Depends(get_db)):
    if not is_expo_token(data.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not an Expo push token")
    now = datetime.now(timezone.utc)
    await db.execute(
        pg_insert(PushDevice)
        .values(token=data.token, user_id=user.id, platform=data.platform, created_at=now, last_seen_at=now)
        .on_conflict_do_update(index_elements=["token"], set_={"user_id": user.id, "platform": data.platform, "last_seen_at": now})
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class DeviceOut(BaseModel):
    token: str


@router.post("/remove", status_code=status.HTTP_204_NO_CONTENT)
async def remove_device(data: DeviceOut, user: User = Depends(get_current_user_unrestricted), db: AsyncSession = Depends(get_db)):
    """Called on sign-out, so the phone stops getting this account's pushes."""
    await db.execute(delete(PushDevice).where(PushDevice.token == data.token, PushDevice.user_id == user.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
