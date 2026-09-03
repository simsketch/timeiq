from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.client import Client
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.services.invoicing import line_amount

router = APIRouter(tags=["clients"])


async def get_owned_client(db: AsyncSession, user: User, client_id: uuid.UUID) -> Client:
    """Fetch a client that belongs to the user, or 404."""
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == user.id)
    )
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Client not found"
        )
    return client


async def unbilled_hours_by_client(
    db: AsyncSession, user: User
) -> dict[uuid.UUID, Decimal]:
    """Sum of unbilled hours per client for the user."""
    result = await db.execute(
        select(TimeEntry.client_id, func.coalesce(func.sum(TimeEntry.hours), 0))
        .where(TimeEntry.user_id == user.id, TimeEntry.invoice_id.is_(None))
        .group_by(TimeEntry.client_id)
    )
    return {cid: Decimal(total) for cid, total in result.all()}


def to_response(client: Client, unbilled: dict[uuid.UUID, Decimal]) -> ClientResponse:
    hours = unbilled.get(client.id, Decimal("0"))
    data = ClientResponse.model_validate(client)
    data.unbilled_hours = hours
    data.unbilled_amount = line_amount(hours, client.hourly_rate)
    return data


@router.get("/api/clients", response_model=list[ClientResponse])
async def list_clients(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Client).where(Client.user_id == user.id).order_by(Client.name.asc())
    )
    unbilled = await unbilled_hours_by_client(db, user)
    return [to_response(c, unbilled) for c in result.scalars().all()]


@router.post(
    "/api/clients", response_model=ClientResponse, status_code=status.HTTP_201_CREATED
)
async def create_client(
    data: ClientCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = Client(user_id=user.id, **data.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return to_response(client, {})


@router.patch("/api/clients/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: uuid.UUID,
    data: ClientUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_owned_client(db, user, client_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    await db.flush()
    await db.refresh(client)
    unbilled = await unbilled_hours_by_client(db, user)
    return to_response(client, unbilled)


@router.delete("/api/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_owned_client(db, user, client_id)
    await db.delete(client)
    await db.flush()
