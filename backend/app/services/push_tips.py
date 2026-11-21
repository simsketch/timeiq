"""Push tips: a few feature tips by push for free and trial accounts.

Only accounts that said yes in the app (push_tips_opt_in, App Store rule
4.5.4) and have a phone registered get them. Each run sends the earliest tip
whose feature the account hasn't used yet, at most one a local day, from 9 AM
to 7 PM in the account's time zone, and nothing after day 10. Tips about
features already in use are skipped. Paying stops the series.

Tips are about features only: no prices, plans, upgrades or trial dates. The
app is sold worldwide and Apple forbids nudging to web checkout outside the US.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from time import monotonic

from sqlalchemy import exists, or_, select

from app.database import async_session
from app.models.assistant_turn import AssistantTurn
from app.models.booking import Booking
from app.models.calendar_source import CalendarSource
from app.models.group_meeting import GroupMeeting
from app.models.push_device import PushDevice
from app.models.user import User
from app.services import billing, email_import, push
from app.services.availability import host_zone
from app.services.weekly_summary import CRON_BUDGET_SECONDS

logger = logging.getLogger(__name__)

WINDOW = timedelta(days=10)
FIRST_HOUR, LAST_HOUR = 9, 19  # local, send while 9 <= hour < 19

# step: (title, body, app path the tap opens)
TIPS = {
    1: ("See your whole week at once", "Connect Google or Outlook and TimeIQ merges every calendar into one view.", "/calendars"),
    2: ('"When are you free?" Answered in one tap', "Share your open times from Home, in any time zone.", "/"),
    3: ("Just say it. It's scheduled.", 'Try "find an hour with Sam next week" in Ask TimeIQ.', "/assistant"),
    4: ("Let people book themselves", "Add your booking link to your email signature. Bookings land on your calendar.", "/event-types"),
    5: ("CC it. It's booked.", 'Add agent@timeiq.app to your next "when works?" email and it books the meeting.', "/"),
}
LAST_STEP = max(TIPS)


@dataclass(frozen=True)
class Facts:
    has_calendar: bool
    has_assistant: bool
    has_booking: bool
    has_agent: bool


def _done(step: int, facts: Facts) -> bool:
    # Sharing open times happens in the phone's share sheet, so step 2 has no
    # signal and always sends once.
    return {1: facts.has_calendar, 2: False, 3: facts.has_assistant, 4: facts.has_booking, 5: facts.has_agent}[step]


def eligible(user) -> bool:
    """Free or trialing; any paid or complimentary plan is out."""
    return user.subscription_status == "trialing" or not billing.is_entitled(user)


def in_window(user, now: datetime) -> bool:
    return user.created_at is not None and now - user.created_at < WINDOW


def offer(user, now: datetime) -> bool:
    """Whether the app should ask this account about tips."""
    return eligible(user) and user.push_tips_asked_at is None and in_window(user, now)


def plan(user, facts: Facts, now: datetime) -> tuple[int | None, int]:
    """(tip to send or None, highest step handled after this run)."""
    done = user.push_tips_step or 0
    if not user.push_tips_opt_in or not eligible(user) or not in_window(user, now) or done >= LAST_STEP:
        return None, done
    tz = host_zone(user)
    local = now.astimezone(tz)
    if not FIRST_HOUR <= local.hour < LAST_HOUR:
        return None, done
    if user.push_tips_sent_at and user.push_tips_sent_at.astimezone(tz).date() == local.date():
        return None, done
    for step in range(done + 1, LAST_STEP + 1):
        if not _done(step, facts):
            return step, step
    return None, LAST_STEP


def _facts_columns():
    uid = User.id
    return (
        # The "From email" source holds forwarded schedules; it's no connected calendar.
        exists().where(CalendarSource.user_id == uid, CalendarSource.is_active.is_(True),
                       CalendarSource.type != email_import.SOURCE_TYPE),
        exists().where(AssistantTurn.user_id == uid),
        exists().where(Booking.host_user_id == uid),
        exists().where(GroupMeeting.organizer_id == uid, GroupMeeting.source == "email"),
    )


async def send_push_tips(now=None) -> dict:
    now = now or datetime.now(timezone.utc)
    result = {"sent": 0, "skipped": 0, "failed": 0}
    async with async_session() as db:
        rows = (await db.execute(
            select(User, *_facts_columns()).where(
                User.push_tips_opt_in.is_(True), User.push_tips_step < LAST_STEP, User.created_at >= now - WINDOW,
                or_(User.subscription_status == "trialing", User.subscription_status.not_in(billing.ENTITLED_STATUSES)),
                exists().where(PushDevice.user_id == User.id),
            )
        )).all()
        todo = {}
        for user, *flags in rows:
            facts = Facts(*flags)
            if plan(user, facts, now)[1] != (user.push_tips_step or 0):
                todo[user.id] = facts
    deadline = monotonic() + CRON_BUDGET_SECONDS
    for uid, facts in todo.items():
        if monotonic() > deadline:
            result["deferred"] = len(todo) - result["sent"] - result["skipped"] - result["failed"]
            break
        try:
            async with async_session() as db:
                user = (await db.execute(select(User).where(User.id == uid).with_for_update(skip_locked=True))).scalar_one_or_none()
                if user is None:
                    continue
                step, done = plan(user, facts, now)
                if done == (user.push_tips_step or 0):
                    continue
                user.push_tips_step = done
                if step is not None:
                    user.push_tips_sent_at = now
                # Record before sending: a lost commit can skip a tip, never repeat one.
                await db.commit()
            if step is None:
                result["skipped"] += 1
                continue
            title, body, path = TIPS[step]
            await push.notify(uid, title, body, {"path": path, "kind": "tip", "step": step})
            result["sent"] += 1
        except Exception:
            logger.exception("Push tip failed for user %s", uid)
            result["failed"] += 1
    return result
