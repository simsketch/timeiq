"""Group meetings: the organizer's routes and each participant's link."""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_current_user_unrestricted
from app.database import get_db
from app.models.group_meeting import GroupMeeting, GroupMeetingParticipant
from app.models.user import User
from app.services import email as mail
from app.services import group_meetings as gm
from app.services.availability import host_zone

logger = logging.getLogger(__name__)

router = APIRouter(tags=["group-meetings"])

MAX_MEETINGS_PER_DAY = 25


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ParticipantIn(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(default=None, max_length=255)


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    duration_minutes: int = Field(ge=15, le=240)
    window_start: Optional[date] = None
    window_end: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=2000)
    location: Optional[str] = Field(default=None, max_length=500)
    participants: list[ParticipantIn] = Field(min_length=1, max_length=gm.MAX_PARTICIPANTS)
    send_invites: bool = True

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Give the meeting a name")
        return v


class BookIn(BaseModel):
    starts_at: datetime


class RespondIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    available_starts: list[str] = Field(default_factory=list, max_length=gm.MAX_SLOTS)


class ParticipantOut(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str]
    responded: bool
    uses_calendar: bool
    link: str


class SlotOut(BaseModel):
    start: str
    yes: int
    no: int
    pending: int
    # participant id -> True / False / None (organizer view only)
    answers: dict[str, Optional[bool]] = {}


class MeetingSummary(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    duration_minutes: int
    window_start: date
    window_end: date
    starts_at: Optional[datetime]
    participant_count: int
    responded_count: int
    created_at: datetime
    source: str = "app"


class MeetingDetail(MeetingSummary):
    note: Optional[str]
    location: Optional[str]
    timezone: str
    participants: list[ParticipantOut]
    slots: list[SlotOut]


class PublicSlot(BaseModel):
    start: str
    # How many people (organizer included) can make it, among those who answered.
    can_make_it: int
    mine: Optional[bool]


class PublicMeeting(BaseModel):
    title: str
    note: Optional[str]
    location: Optional[str]
    duration_minutes: int
    organizer_name: str
    organizer_timezone: str
    status: str
    starts_at: Optional[datetime]
    ends_at: Optional[datetime]
    people: int
    answered: int
    me_name: Optional[str]
    me_email: str
    uses_calendar: bool
    responded: bool
    slots: list[PublicSlot]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _link(p: GroupMeetingParticipant) -> str:
    return f"{mail._site()}/meet/{p.token}"


def _summary(m: GroupMeeting) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "status": m.status,
        "duration_minutes": m.duration_minutes,
        "window_start": m.window_start,
        "window_end": m.window_end,
        "starts_at": m.starts_at,
        "participant_count": len(m.participants),
        "responded_count": sum(1 for p in m.participants if p.responded_at),
        "created_at": m.created_at,
        "source": m.source,
    }


async def _own_meeting(db: AsyncSession, user: User, meeting_id: uuid.UUID) -> GroupMeeting:
    meeting = await db.get(GroupMeeting, meeting_id)
    if meeting is None or meeting.organizer_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


async def _detail(db: AsyncSession, meeting: GroupMeeting) -> MeetingDetail:
    slots: list[SlotOut] = []
    if meeting.status == "open":
        candidates = await gm.candidate_slots(db, meeting)
        answers = await gm.participant_answers(db, meeting, candidates)
        for row in gm.rank(candidates, answers):
            row["answers"] = {pid: a.get(row["start"]) for pid, a in answers.items()}
            slots.append(SlotOut(**row))
    return MeetingDetail(
        **_summary(meeting),
        note=meeting.note,
        location=meeting.location,
        timezone=meeting.organizer.timezone or "America/New_York",
        participants=[
            ParticipantOut(
                id=p.id,
                email=p.email,
                name=p.name,
                responded=bool(p.responded_at),
                uses_calendar=p.uses_calendar,
                link=_link(p),
            )
            for p in meeting.participants
        ],
        slots=slots,
    )


async def _participant(db: AsyncSession, token: str) -> GroupMeetingParticipant:
    p = (
        await db.execute(select(GroupMeetingParticipant).where(GroupMeetingParticipant.token == token))
    ).scalars().first()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This link isn't valid. Ask the organizer for a new one.")
    return p


# ---------------------------------------------------------------------------
# Organizer
# ---------------------------------------------------------------------------


@router.post("/api/group-meetings", response_model=MeetingDetail, status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: MeetingCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = await db.scalar(
        select(func.count()).select_from(GroupMeeting).where(GroupMeeting.organizer_id == user.id, GroupMeeting.created_at > since)
    )
    if (recent or 0) >= MAX_MEETINGS_PER_DAY:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="That's a lot of meetings for one day. Try again tomorrow.")

    today = datetime.now(timezone.utc).astimezone(host_zone(user)).date()
    start = max(payload.window_start or today, today)
    end = payload.window_end or start + timedelta(days=6)
    if end < start:
        raise HTTPException(status_code=422, detail="The last day must be on or after the first day")
    if (end - start).days + 1 > gm.MAX_WINDOW_DAYS:
        raise HTTPException(status_code=422, detail=f"Look at {gm.MAX_WINDOW_DAYS} days or fewer")

    seen: set[str] = set()
    people: list[ParticipantIn] = []
    for p in payload.participants:
        email = p.email.strip().lower()
        if email == user.email.lower() or email in seen:
            continue
        seen.add(email)
        people.append(ParticipantIn(email=email, name=(p.name or "").strip() or None))
    if not people:
        raise HTTPException(status_code=422, detail="Add at least one person besides you")

    meeting = GroupMeeting(
        organizer_id=user.id,
        title=payload.title,
        note=(payload.note or "").strip() or None,
        location=(payload.location or "").strip() or None,
        duration_minutes=payload.duration_minutes,
        window_start=start,
        window_end=end,
        status="open",
    )
    meeting.participants = [GroupMeetingParticipant(email=p.email, name=p.name, token=gm.new_token()) for p in people]
    db.add(meeting)
    await db.flush()
    await db.refresh(meeting, attribute_names=["organizer", "participants"])
    await db.commit()

    if payload.send_invites:
        for p in meeting.participants:
            mail.send_group_invite(meeting, p)
    return await _detail(db, meeting)


@router.get("/api/group-meetings", response_model=list[MeetingSummary])
async def list_meetings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(GroupMeeting).where(GroupMeeting.organizer_id == user.id).order_by(GroupMeeting.created_at.desc()).limit(100)
        )
    ).scalars().all()
    return [MeetingSummary(**_summary(m)) for m in rows]


@router.get("/api/group-meetings/{meeting_id}", response_model=MeetingDetail)
async def get_meeting(meeting_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _detail(db, await _own_meeting(db, user, meeting_id))


@router.post("/api/group-meetings/{meeting_id}/participants", response_model=MeetingDetail)
async def add_participant(
    meeting_id: uuid.UUID, payload: ParticipantIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    meeting = await _own_meeting(db, user, meeting_id)
    if meeting.status != "open":
        raise HTTPException(status_code=400, detail="This meeting is no longer open")
    email = payload.email.strip().lower()
    if email == user.email.lower() or any(p.email == email for p in meeting.participants):
        raise HTTPException(status_code=409, detail="That person is already in this meeting")
    if len(meeting.participants) >= gm.MAX_PARTICIPANTS:
        raise HTTPException(status_code=400, detail=f"A meeting can have up to {gm.MAX_PARTICIPANTS} people")
    p = GroupMeetingParticipant(email=email, name=(payload.name or "").strip() or None, token=gm.new_token())
    meeting.participants.append(p)
    meeting.all_answered_notified_at = None
    await db.flush()
    await db.commit()
    mail.send_group_invite(meeting, p)
    return await _detail(db, meeting)


@router.delete("/api/group-meetings/{meeting_id}/participants/{participant_id}", response_model=MeetingDetail)
async def remove_participant(
    meeting_id: uuid.UUID, participant_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    meeting = await _own_meeting(db, user, meeting_id)
    if meeting.status != "open":
        raise HTTPException(status_code=400, detail="This meeting is no longer open")
    target = next((p for p in meeting.participants if p.id == participant_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    if len(meeting.participants) == 1:
        raise HTTPException(status_code=400, detail="A meeting needs at least one other person")
    meeting.participants.remove(target)
    await db.flush()
    return await _detail(db, meeting)


@router.post("/api/group-meetings/{meeting_id}/remind")
async def remind(meeting_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meeting = await _own_meeting(db, user, meeting_id)
    if meeting.status != "open":
        raise HTTPException(status_code=400, detail="This meeting is no longer open")
    waiting = [p for p in meeting.participants if not p.responded_at]
    for p in waiting:
        mail.send_group_invite(meeting, p, reminder=True)
    return {"reminded": len(waiting)}


@router.post("/api/group-meetings/{meeting_id}/book", response_model=MeetingDetail)
async def book_meeting(
    meeting_id: uuid.UUID, payload: BookIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    meeting = await _own_meeting(db, user, meeting_id)
    try:
        await gm.book(db, meeting, payload.starts_at)
    except gm.GroupMeetingError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await db.commit()
    mail.send_group_booked(meeting)
    return await _detail(db, meeting)


@router.post("/api/group-meetings/{meeting_id}/cancel", response_model=MeetingDetail)
async def cancel_meeting(meeting_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meeting = await _own_meeting(db, user, meeting_id)
    try:
        was_booked = await gm.cancel(db, meeting)
    except gm.GroupMeetingError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await db.commit()
    if was_booked:
        mail.send_group_cancelled(meeting)
    return await _detail(db, meeting)


@router.delete("/api/group-meetings/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(meeting_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meeting = await _own_meeting(db, user, meeting_id)
    if meeting.status == "booked":
        raise HTTPException(status_code=409, detail="Cancel the meeting first, so everyone's invite is withdrawn")
    await db.delete(meeting)


# ---------------------------------------------------------------------------
# Participant link (no account needed)
# ---------------------------------------------------------------------------


async def _public(db: AsyncSession, p: GroupMeetingParticipant) -> PublicMeeting:
    # Load explicitly: a lazy p.meeting would do IO outside the async context.
    meeting = await db.get(GroupMeeting, p.meeting_id)
    slots: list[PublicSlot] = []
    if meeting.status == "open":
        candidates = await gm.candidate_slots(db, meeting)
        answers = await gm.participant_answers(db, meeting, candidates)
        mine = answers.get(str(p.id), {})
        for s in candidates:
            key = gm.iso(s)
            # The organizer is free at every candidate, so they count as one.
            yes = 1 + sum(1 for a in answers.values() if a.get(key) is True)
            slots.append(PublicSlot(start=key, can_make_it=yes, mine=mine.get(key)))
    return PublicMeeting(
        title=meeting.title,
        note=meeting.note,
        location=meeting.location,
        duration_minutes=meeting.duration_minutes,
        organizer_name=meeting.organizer.name or meeting.organizer.email,
        organizer_timezone=meeting.organizer.timezone or "America/New_York",
        status=meeting.status,
        starts_at=meeting.starts_at,
        ends_at=meeting.ends_at,
        people=len(meeting.participants) + 1,
        answered=1 + sum(1 for x in meeting.participants if x.responded_at),
        me_name=p.name,
        me_email=p.email,
        uses_calendar=p.uses_calendar,
        responded=bool(p.responded_at),
        slots=slots,
    )


@router.get("/api/meet/{token}", response_model=PublicMeeting)
async def view_invite(token: str, db: AsyncSession = Depends(get_db)):
    return await _public(db, await _participant(db, token))


@router.post("/api/meet/{token}/respond", response_model=PublicMeeting)
async def respond(token: str, payload: RespondIn, db: AsyncSession = Depends(get_db)):
    p = await _participant(db, token)
    meeting = await db.get(GroupMeeting, p.meeting_id)
    if meeting.status != "open":
        raise HTTPException(status_code=400, detail="This meeting is already booked or cancelled")
    candidates = {gm.iso(s) for s in await gm.candidate_slots(db, meeting)}
    p.available_starts = sorted({s for s in payload.available_starts if s in candidates})
    p.uses_calendar = False
    if payload.name and payload.name.strip():
        p.name = payload.name.strip()
    p.responded_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    await gm.notify_if_all_answered(db, meeting)
    return await _public(db, p)


@router.post("/api/meet/{token}/use-calendar", response_model=PublicMeeting)
async def use_calendar(
    token: str, user: User = Depends(get_current_user_unrestricted), db: AsyncSession = Depends(get_db)
):
    """A signed-in TimeIQ user shares their free/busy for this meeting instead of ticking times."""
    p = await _participant(db, token)
    meeting = await db.get(GroupMeeting, p.meeting_id)
    if meeting.status != "open":
        raise HTTPException(status_code=400, detail="This meeting is already booked or cancelled")
    if user.id == meeting.organizer_id:
        raise HTTPException(status_code=400, detail="You're the organizer; your calendar is already included")
    p.user_id = user.id
    p.uses_calendar = True
    p.available_starts = []
    if not p.name and user.name:
        p.name = user.name
    p.responded_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    await gm.notify_if_all_answered(db, meeting)
    return await _public(db, p)
