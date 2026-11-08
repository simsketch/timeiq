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
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5-5"
MAX_ROUNDS = 8           # tool rounds per message
TIME_BUDGET = 45.0       # seconds; the serverless function stops at 60
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
- Before anything that emails other people or changes calendars (finding time with people, booking, \
cancelling, reminders{invoices}), say exactly what you're about to do in one or two lines and ask \
"Shall I go ahead?". Do it only after a clear yes.
- Keep replies short: a sentence or two, then a short list if it helps. No tables, no headings.
- If something needs the app (connecting a calendar, payment), say where: Calendars, Settings, \
Pricing.
- Someone new may have no calendars connected yet. If their calendar comes back empty, answer what \
you can, then say that connecting Google, Outlook or iCloud on Calendars lets you see their real \
free time.
- If a tool fails, say what went wrong in plain words and what they can do."""


async def chat(user: User, history: list[dict[str, Any]]) -> dict[str, Any]:
    """Run one turn. `history` is the Anthropic-format message list from earlier turns plus
    the new user message; returns the updated history, the reply text and the steps taken."""
    import anthropic  # slow to import; only the assistant needs it

    from app import mcp_server

    zone = ZoneInfo(user.timezone or "UTC")
    now = datetime.now(timezone.utc).astimezone(zone)
    tools = [
        {"name": t.name, "description": t.description or "", "input_schema": t.input_schema}
        for t in await mcp_server.mcp.list_tools()
        if user.invoicing_enabled or t.name not in INVOICING_TOOLS
    ]
    system = SYSTEM.format(
        name=user.name or user.username or "the user",
        now=now.strftime("%A %B %-d, %Y, %-I:%M %p"),
        zone=zone.key,
        invoices=", sending invoices" if user.invoicing_enabled else "",
    )
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    messages = list(history)
    steps: list[dict[str, Any]] = []
    started = time.monotonic()

    with request_token(user) as token:
        reset = mcp_server._token.set(token)
        try:
            for _ in range(MAX_ROUNDS):
                response = await client.messages.create(
                    model=MODEL, max_tokens=4096, system=system, tools=tools, messages=messages,
                    output_config={"effort": "low"},
                )
                messages.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in response.content]})
                if response.stop_reason != "tool_use":
                    break
                results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    ok, text = await _run_tool(mcp_server, block.name, block.input)
                    steps.append({"tool": block.name, "ok": ok})
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": text, "is_error": not ok})
                messages.append({"role": "user", "content": results})
                if time.monotonic() - started > TIME_BUDGET:
                    messages.append({"role": "assistant", "content": [{"type": "text", "text": "That's taking longer than it should. Ask me again and I'll pick up from here."}]})
                    break
        finally:
            mcp_server._token.reset(reset)

    reply = next(
        (b["text"] for b in reversed(messages[-1]["content"]) if b.get("type") == "text"),
        "",
    ) if messages and messages[-1]["role"] == "assistant" else ""
    if not reply:
        reply = "Sorry, I lost my train of thought there. Could you ask that again?"
        messages.append({"role": "assistant", "content": [{"type": "text", "text": reply}]}) if messages[-1]["role"] != "assistant" else messages[-1]["content"].append({"type": "text", "text": reply})
    return {"messages": messages, "reply": reply, "steps": steps}


async def _run_tool(mcp_server, name: str, args: dict[str, Any]) -> tuple[bool, str]:
    try:
        result = await mcp_server.mcp.call_tool(name, args or {})
    except Exception as exc:  # a tool's ToolError, or bad arguments from the model
        return False, str(exc) or exc.__class__.__name__
    text = "\n".join(getattr(c, "text", "") for c in (result.content or []) if getattr(c, "text", None))
    is_error = bool(getattr(result, "is_error", False) or getattr(result, "isError", False))
    return (not is_error), (text or json.dumps({"ok": not is_error}))
