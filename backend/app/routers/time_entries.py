from __future__ import annotations

import uuid
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.cached_event import CachedEvent
from app.models.client import Client
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.routers.clients import get_owned_client, unbilled_hours_by_client
from app.schemas.time_entry import (
    SuggestedEntry,
    SuggestRequest,
    TimeEntryBulkCreate,
    TimeEntryCreate,
    TimeEntryResponse,
    TimeEntryUpdate,
    UnbilledSummary,
)
from app.services.invoicing import (
    duration_to_hours,
    line_amount,
    parse_keywords,
    title_matches,
)

router = APIRouter(tags=["time-entries"])

ENTRY_LOAD = (selectinload(TimeEntry.client), selectinload(TimeEntry.invoice))


def to_response(entry: TimeEntry) -> TimeEntryResponse:
    return TimeEntryResponse(
        id=entry.id,
        client_id=entry.client_id,
        client_name=entry.client.name,
        entry_date=entry.entry_date,
        hours=entry.hours,
        description=entry.description,
        invoice_id=entry.invoice_id,
        invoice_number=entry.invoice.number if entry.invoice else None,
        created_at=entry.created_at,
    )


async def get_owned_entry(
    db: AsyncSession, user: User, entry_id: uuid.UUID
) -> TimeEntry:
    result = await db.execute(
        select(TimeEntry)
        .options(*ENTRY_LOAD)
        .where(TimeEntry.id == entry_id, TimeEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found"
        )
    return entry


def reject_if_billed(entry: TimeEntry) -> None:
    if entry.invoice_id is not None:
        number = entry.invoice.number if entry.invoice else "an invoice"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entry is on invoice {number}",
        )


# Static paths are declared before /{entry_id} so they match first.


@router.get("/api/time-entries/summary", response_model=list[UnbilledSummary])
async def unbilled_summary(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    unbilled = await unbilled_hours_by_client(db, user)
    if not unbilled:
        return []
    result = await db.execute(
        select(Client)
        .where(Client.id.in_(list(unbilled.keys())))
        .order_by(Client.name.asc())
    )
    return [
        UnbilledSummary(
            client_id=c.id,
            client_name=c.name,
            currency=c.currency,
            unbilled_hours=unbilled[c.id],
            unbilled_amount=line_amount(unbilled[c.id], c.hourly_rate),
        )
        for c in result.scalars().all()
    ]


@router.post("/api/time-entries/suggest", response_model=list[SuggestedEntry])
async def suggest_entries(
    data: SuggestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Suggest time entries from cached calendar events matching the client's keywords."""
    client = await get_owned_client(db, user, data.client_id)
    keywords = parse_keywords(client.match_keywords)
    if not keywords:
        return []
    tz = ZoneInfo(user.timezone or "UTC")
    range_start = datetime.combine(data.start, time.min, tzinfo=tz)
    range_end = datetime.combine(data.end, time.max, tzinfo=tz)

    events = (
        (
            await db.execute(
                select(CachedEvent)
                .where(
                    CachedEvent.user_id == user.id,
                    CachedEvent.is_all_day.is_(False),
                    CachedEvent.starts_at >= range_start,
                    CachedEvent.starts_at <= range_end,
                )
                .order_by(CachedEvent.starts_at.asc())
            )
        )
        .scalars()
        .all()
    )

    existing = (
        await db.execute(
            select(TimeEntry.entry_date, TimeEntry.description).where(
                TimeEntry.user_id == user.id,
                TimeEntry.client_id == client.id,
                TimeEntry.entry_date >= data.start,
                TimeEntry.entry_date <= data.end,
            )
        )
    ).all()
    existing_keys = {(d, desc.strip().lower()) for d, desc in existing}

    suggestions: list[SuggestedEntry] = []
    for ev in events:
        if not title_matches(ev.title, keywords):
            continue
        local_date = ev.starts_at.astimezone(tz).date()
        title = (ev.title or "").strip()
        if (local_date, title.lower()) in existing_keys:
            continue
        suggestions.append(
            SuggestedEntry(
                external_id=ev.external_id,
                title=title,
                entry_date=local_date,
                hours=duration_to_hours(ev.starts_at, ev.ends_at),
                starts_at=ev.starts_at,
                ends_at=ev.ends_at,
            )
        )
    return suggestions


@router.get("/api/time-entries", response_model=list[TimeEntryResponse])
async def list_entries(
    client_id: uuid.UUID | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(TimeEntry)
        .options(*ENTRY_LOAD)
        .where(TimeEntry.user_id == user.id)
        .order_by(TimeEntry.entry_date.desc(), TimeEntry.created_at.desc())
    )
    if client_id:
        query = query.where(TimeEntry.client_id == client_id)
    if start:
        query = query.where(TimeEntry.entry_date >= start)
    if end:
        query = query.where(TimeEntry.entry_date <= end)
    result = await db.execute(query)
    return [to_response(e) for e in result.scalars().all()]


@router.post(
    "/api/time-entries",
    response_model=TimeEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    data: TimeEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_owned_client(db, user, data.client_id)
    entry = TimeEntry(user_id=user.id, **data.model_dump())
    db.add(entry)
    await db.flush()
    return to_response(await get_owned_entry(db, user, entry.id))


@router.post(
    "/api/time-entries/bulk",
    response_model=list[TimeEntryResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_entries_bulk(
    data: TimeEntryBulkCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for client_id in {e.client_id for e in data.entries}:
        await get_owned_client(db, user, client_id)
    entries = [TimeEntry(user_id=user.id, **e.model_dump()) for e in data.entries]
    db.add_all(entries)
    await db.flush()
    ids = [e.id for e in entries]
    result = await db.execute(
        select(TimeEntry)
        .options(*ENTRY_LOAD)
        .where(TimeEntry.id.in_(ids))
        .order_by(TimeEntry.entry_date.desc())
    )
    return [to_response(e) for e in result.scalars().all()]


@router.patch("/api/time-entries/{entry_id}", response_model=TimeEntryResponse)
async def update_entry(
    entry_id: uuid.UUID,
    data: TimeEntryUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await get_owned_entry(db, user, entry_id)
    reject_if_billed(entry)
    changes = data.model_dump(exclude_unset=True)
    if "client_id" in changes:
        await get_owned_client(db, user, changes["client_id"])
    for key, value in changes.items():
        setattr(entry, key, value)
    await db.flush()
    # Re-select so a changed client_id shows the new client name.
    db.expire(entry)
    return to_response(await get_owned_entry(db, user, entry_id))


@router.delete("/api/time-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await get_owned_entry(db, user, entry_id)
    reject_if_billed(entry)
    await db.delete(entry)
    await db.flush()
