"""The in-app assistant: chat with TimeIQ from the dashboard.

Claude gets the same tools as the MCP server (app/mcp_server.py), and each tool
calls TimeIQ's own HTTP API in-process as the signed-in user, so the assistant
can do exactly what the person could do in the app, with the same checks and
the same subscription gate.

The tools authenticate with a one-off token that lives only in this process's
memory for the length of one chat request (see request_token), so a slow tool
loop never outlives a short-lived session JWT, and the token is useless
anywhere else.
"""
from __future__ import annotations

import json
import logging
import secrets
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_turn import AssistantTurn
from app.models.user import User
from app.services import billing, llm

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5-5"
MAX_ROUNDS = 8           # tool rounds per message
TIME_BUDGET = 45.0       # seconds; the serverless function stops at 60
# Turns per user: per rolling minute, and per rolling 24 hours without / with a plan.
TURNS_PER_MINUTE = 10
TURNS_PER_DAY_FREE = 50
TURNS_PER_DAY_PAID = 200
# Time tracking and invoicing are owner-only for now (users.invoicing_enabled).
INVOICING_TOOLS = {
    "list_clients", "log_time", "list_time_entries", "get_hours_and_money",
    "list_unbilled_time", "list_invoices", "create_invoice", "send_invoice",
}

_TOKENS: dict[str, tuple[str, float]] = {}
PREFIX = "tiqa_"


def looks_like_token(raw: str) -> bool:
    return raw.startswith(PREFIX)


def clerk_id_for(raw: str) -> str | None:
    hit = _TOKENS.get(raw)
    if hit is None or hit[1] < time.monotonic():
        return None
    return hit[0]


@contextmanager
def request_token(user: User):
    token = PREFIX + secrets.token_urlsafe(32)
    _TOKENS[token] = (user.clerk_id, time.monotonic() + TIME_BUDGET + 15)
    try:
        yield token
    finally:
        _TOKENS.pop(token, None)


SYSTEM = """You are TimeIQ's assistant, inside the TimeIQ app. TimeIQ is a scheduling app: one \
booking link across all of a person's calendars, group scheduling, and schedules imported from \
email or text.

You're talking to {name}. It is {now} in their time zone ({zone}). Say every time in their zone, \
like "Tue Nov 11, 3:00 PM".

How to work:
- Use the tools to look things up rather than guessing. Read before you write.
- {confirm_rule}
- Keep replies short: a sentence or two, then a short list if it helps. No tables, no headings.
- If something needs the app (connecting a calendar, payment), say where: Calendars, Settings, \
Pricing.
- Someone new may have no calendars connected yet. If their calendar comes back empty, answer what \
you can, then say that connecting Google, Outlook or iCloud on Calendars lets you see their real \
free time.
- If a tool fails, say what went wrong in plain words and what they can do."""


async def start_turn(db: AsyncSession, user: User) -> AssistantTurn:
    """Check the user's limits and reserve a turn (commits). A database lock and count
    hold across serverless instances, and the reserved row counts in-flight turns too."""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"timeiq-assistant:{user.id}"},
    )
    now = datetime.now(timezone.utc)
    day, minute = (await db.execute(
        select(
            func.count(AssistantTurn.id),
            func.count(AssistantTurn.id).filter(AssistantTurn.created_at > now - timedelta(minutes=1)),
        ).where(AssistantTurn.user_id == user.id, AssistantTurn.created_at > now - timedelta(days=1))
    )).one()
    if day >= (TURNS_PER_DAY_PAID if billing.is_entitled(user) else TURNS_PER_DAY_FREE):
        raise HTTPException(429, "You've reached today's limit for Ask TimeIQ. It resets within 24 hours.")
    if minute >= TURNS_PER_MINUTE:
        raise HTTPException(429, "Slow down a little and try again in a minute.")
    turn = AssistantTurn(user_id=user.id, created_at=now, model=MODEL)
    db.add(turn)
    await db.commit()
    return turn


# How to get a yes before anything that emails other people or changes calendars.
ASK_FIRST = """Before anything that emails other people or changes calendars (finding time with people, booking, \
cancelling, reminders{invoices}), say exactly what you're about to do in one or two lines and ask \
"Shall I go ahead?". Do it only after a clear yes."""
CARD = """For anything that emails other people or changes calendars (finding time with people, booking, \
cancelling, reminders{invoices}), first look up what you need, then write one or two lines saying \
exactly what will happen (who, when, how long) and call the tool in the same reply. The app holds \
the tool and shows the user Confirm and Cancel buttons, so don't ask "Shall I go ahead?" yourself."""


def cancelled(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The user pressed Cancel on held tools: answer them as not run, with no model call."""
    results = [
        {"type": "tool_result", "tool_use_id": b["id"], "content": "The user cancelled this. Nothing was done.", "is_error": True}
        for b in history[-1]["content"] if b.get("type") == "tool_use"
    ]
    return [*history, {"role": "user", "content": results},
            {"role": "assistant", "content": [{"type": "text", "text": "OK, I didn't do that."}]}]


async def chat(user: User, history: list[dict[str, Any]], confirmed: bool = False, cards: bool = False) -> dict[str, Any]:
    """Run one turn. `history` is the Anthropic-format message list from earlier turns plus
    the new user message; returns the updated history, the reply text, the steps taken and
    the token usage summed over every model call.

    Tools marked destructive (they email people or change calendars) never run straight
    away: the turn stops with them unanswered and `pending` set, and the app asks the user.
    Confirming sends the same history back with `confirmed`, which runs them and carries on.
    Only apps that show the confirm card send `cards`; older ones get asked in text."""
    from app import mcp_server

    zone = ZoneInfo(user.timezone or "UTC")
    now = datetime.now(timezone.utc).astimezone(zone)
    listed = [t for t in await mcp_server.mcp.list_tools() if user.invoicing_enabled or t.name not in INVOICING_TOOLS]
    outward = {t.name for t in listed if cards and t.annotations and t.annotations.destructive_hint}
    tools = [{"name": t.name, "description": t.description or "", "input_schema": t.input_schema} for t in listed]
    # Prompt caching: tools render first, so they cache across turns and users; the
    # system prompt (it has the time in it) caches across this turn's tool rounds.
    if tools:
        tools[-1]["cache_control"] = {"type": "ephemeral"}
    invoices = ", sending invoices" if user.invoicing_enabled else ""
    system = SYSTEM.format(
        confirm_rule=(CARD if cards else ASK_FIRST).format(invoices=invoices),
        name=user.name or user.username or "the user",
        now=now.strftime("%A %B %-d, %Y, %-I:%M %p"),
        zone=zone.key,
    )
    client = llm.client()
    messages = list(history)
    steps: list[dict[str, Any]] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "model": llm.model_id(MODEL)}
    started = time.monotonic()
    pending: list[dict[str, Any]] = []

    async def run_all(content: list[dict[str, Any]]) -> None:
        results = []
        for block in content:
            if block.get("type") != "tool_use":
                continue
            ok, text = await _run_tool(mcp_server, block["name"], block.get("input") or {})
            steps.append({"tool": block["name"], "ok": ok})
            results.append({"type": "tool_result", "tool_use_id": block["id"], "content": text, "is_error": not ok})
        messages.append({"role": "user", "content": results})

    with request_token(user) as token:
        reset = mcp_server._token.set(token)
        try:
            if confirmed:
                await run_all(messages[-1]["content"])
            for _ in range(MAX_ROUNDS):
                response = await client.messages.create(
                    model=llm.model_id(MODEL), max_tokens=4096, tools=tools, messages=messages,
                    system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                    output_config={"effort": "low"}, extra_body=llm.extra_body(),
                )
                u = response.usage
                usage["input_tokens"] += (u.input_tokens or 0) + (u.cache_creation_input_tokens or 0) + (u.cache_read_input_tokens or 0)
                usage["output_tokens"] += u.output_tokens or 0
                usage["model"] = response.model or usage["model"]
                messages.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in response.content]})
                if response.stop_reason != "tool_use":
                    break
                pending = [{"tool": b.name, "input": b.input} for b in response.content if b.type == "tool_use" and b.name in outward]
                if pending:
                    break  # held for the user's Confirm
                await run_all(messages[-1]["content"])
                if time.monotonic() - started > TIME_BUDGET:
                    messages.append({"role": "assistant", "content": [{"type": "text", "text": "That's taking longer than it should. Ask me again and I'll pick up from here."}]})
                    break
        finally:
            mcp_server._token.reset(reset)

    reply = next(
        (b["text"] for b in reversed(messages[-1]["content"]) if b.get("type") == "text"),
        "",
    ) if messages and messages[-1]["role"] == "assistant" else ""
    if pending:
        # The card shows what Confirm will actually do; the model's own words can drift from its tool call.
        described = await _describe(user, pending)
        if not reply:
            reply = described or "Here's what I'd do: " + "; ".join(p["tool"].replace("_", " ") for p in pending) + "."
            messages[-1]["content"].insert(0, {"type": "text", "text": reply})
        reply = described or reply
        return {"messages": messages, "reply": reply, "steps": steps, "usage": usage, "pending": pending}
    if not reply:
        reply = "Sorry, I lost my train of thought there. Could you ask that again?"
        messages.append({"role": "assistant", "content": [{"type": "text", "text": reply}]}) if messages[-1]["role"] != "assistant" else messages[-1]["content"].append({"type": "text", "text": reply})
    return {"messages": messages, "reply": reply, "steps": steps, "usage": usage, "pending": None}


async def _describe(user: User, pending: list[dict[str, Any]]) -> str:
    """The confirm card's text, built from the held calls themselves so it always matches what
    Confirm will do. Empty when a held tool isn't one this knows how to describe."""
    from app.database import async_session
    from app.models import Booking

    zone = ZoneInfo(user.timezone or "UTC")

    def when(value: Any) -> str:
        try:
            moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
            return moment.astimezone(zone).strftime("%a %b %-d, %-I:%M %p")
        except ValueError:
            return str(value)

    async def booking(booking_id: Any) -> Booking | None:
        try:
            async with async_session() as db:
                return (await db.execute(select(Booking).where(
                    Booking.id == uuid.UUID(str(booking_id)), Booking.host_user_id == user.id))).scalar_one_or_none()
        except ValueError:
            return None

    lines = []
    for p in pending:
        a, tool = p.get("input") or {}, p["tool"]
        if tool == "book_meeting":
            who = f"{a['name']} ({a.get('email')})" if a.get("name") else a.get("email")
            length = f" for {a['duration_minutes']} minutes" if a.get("duration_minutes") else ""
            lines.append(f"Book {who} on {when(a.get('starts_at'))}{length}. They get a calendar invite.")
        elif tool in ("reschedule_booking", "cancel_booking") and (b := await booking(a.get("booking_id"))):
            if tool == "cancel_booking":
                lines.append(f"Cancel {b.visitor_name}'s meeting on {when(b.starts_at)}. They're emailed.")
            else:
                lines.append(f"Move {b.visitor_name}'s meeting from {when(b.starts_at)} to "
                             f"{when(a.get('starts_at'))}. Their calendar invite moves too.")
        elif tool == "find_time_with":
            lines.append(f"Email {', '.join(a.get('emails') or [])} a link to pick a time for "
                         f"\"{a.get('title')}\" ({a.get('duration_minutes') or 30} minutes).")
        else:
            return ""
    return "\n".join(lines)


async def _run_tool(mcp_server, name: str, args: dict[str, Any]) -> tuple[bool, str]:
    try:
        result = await mcp_server.mcp.call_tool(name, args or {})
    except Exception as exc:  # a tool's ToolError, or bad arguments from the model
        return False, str(exc) or exc.__class__.__name__
    text = "\n".join(getattr(c, "text", "") for c in (result.content or []) if getattr(c, "text", None))
    is_error = bool(getattr(result, "is_error", False) or getattr(result, "isError", False))
    return (not is_error), (text or json.dumps({"ok": not is_error}))
