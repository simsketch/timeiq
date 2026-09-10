from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.timesheet_row import TimesheetRow
from app.models.user import User
from app.routers.clients import get_owned_client

router = APIRouter(prefix="/api/timesheet-rows", tags=["timesheet-rows"])


class RowCreate(BaseModel):
    client_id: uuid.UUID
    description: str = Field(..., min_length=1)


class RowUpdate(BaseModel):
    client_id: Optional[uuid.UUID] = None
    description: Optional[str] = Field(default=None, min_length=1)


class RowResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    description: str
    created_at: datetime


def to_response(row: TimesheetRow) -> RowResponse:
    return RowResponse(id=row.id, client_id=row.client_id, client_name=row.client.name, description=row.description, created_at=row.created_at)


async def _owned(db: AsyncSession, user: User, row_id: uuid.UUID) -> TimesheetRow:
    row = (
        await db.execute(
            select(TimesheetRow).options(selectinload(TimesheetRow.client)).where(TimesheetRow.id == row_id, TimesheetRow.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Row not found")
    return row


@router.get("", response_model=list[RowResponse])
async def list_rows(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(TimesheetRow).options(selectinload(TimesheetRow.client)).where(TimesheetRow.user_id == user.id).order_by(TimesheetRow.sort_order, TimesheetRow.created_at)
        )
    ).scalars().all()
    return [to_response(r) for r in rows]


@router.post("", response_model=RowResponse, status_code=status.HTTP_201_CREATED)
async def create_row(data: RowCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_owned_client(db, user, data.client_id)
    description = data.description.strip()
    existing = (
        await db.execute(
            select(TimesheetRow).options(selectinload(TimesheetRow.client)).where(
                TimesheetRow.user_id == user.id, TimesheetRow.client_id == data.client_id, TimesheetRow.description == description
            )
        )
    ).scalar_one_or_none()
    if existing:
        return to_response(existing)
    row = TimesheetRow(user_id=user.id, client_id=data.client_id, description=description)
    db.add(row)
    await db.flush()
    return to_response(await _owned(db, user, row.id))


@router.patch("/{row_id}", response_model=RowResponse)
async def update_row(row_id: uuid.UUID, data: RowUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, user, row_id)
    changes = data.model_dump(exclude_unset=True)
    if "client_id" in changes:
        await get_owned_client(db, user, changes["client_id"])
        row.client_id = changes["client_id"]
    if "description" in changes:
        row.description = changes["description"].strip()
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That client and task already have a row")
    db.expire(row)
    return to_response(await _owned(db, user, row_id))


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_row(row_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await _owned(db, user, row_id)
    await db.delete(row)
    await db.flush()
