"""TimeIQ's MCP server, at /mcp (Streamable HTTP, stateless, JSON responses).

People connect Claude, ChatGPT, Cursor and other MCP clients with a personal
access token (Settings → API tokens), sent as ``Authorization: Bearer tiq_…``.

Every tool calls TimeIQ's own HTTP API in-process with the caller's token, so
tools get exactly the validation, ownership checks and subscription gate the
web app has, and there's no second copy of the business logic to drift.

Serverless note: the SDK's session manager normally starts once in the app's
lifespan. Vercel functions don't reliably run lifespans, so each request gets a
fresh stateless manager, which the SDK supports ("create a new instance").
"""
from __future__ import annotations

import contextvars
import json
from datetime import date
from typing import Any, Optional

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp_types import ToolAnnotations
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from app.config import settings
from app.database import async_session
from app.services import api_tokens

_token: contextvars.ContextVar[str] = contextvars.ContextVar("timeiq_mcp_token")

INSTRUCTIONS = """TimeIQ is a scheduling app: one booking link across all of a person's calendars, \
group scheduling, schedules imported from email or text, plus timesheets and invoices.

Times are ISO 8601. The user's own time zone is in get_profile; say times to them in it.
Before anything that emails other people or changes their calendar (booking or cancelling, \
sending group invites, sending invoices), confirm with the user first."""

mcp = MCPServer(name="TimeIQ", instructions=INSTRUCTIONS, website_url="https://timeiq.app")

READ = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)
WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)
# Changes something other people see: email, invites, cancellations.
OUTWARD = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=True)


async def _api(method: str, path: str, *, params: dict | None = None, body: Any = None) -> Any:
    from app.main import app  # imported lazily: app.main mounts this module

    params = {k: v for k, v in (params or {}).items() if v is not None}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://timeiq.internal") as client:
        response = await client.request(
            method, path, params=params, json=body, headers={"Authorization": f"Bearer {_token.get()}"}
        )
    if response.status_code == 402:
        raise ToolError("This TimeIQ account doesn't have an active subscription. Renew it at https://timeiq.app/pricing.")
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = None
        if isinstance(detail, list):  # FastAPI validation errors
            detail = "; ".join(f"{'.'.join(str(p) for p in d.get('loc', [])[1:])}: {d.get('msg')}" for d in detail)
        raise ToolError(str(detail or f"TimeIQ returned HTTP {response.status_code}"))
    return response.json() if response.content else {"ok": True}


def _out(data: Any) -> str:
    return json.dumps(data, indent=2, default=str)


# --- Profile, availability & bookings --------------------------------------------------------

@mcp.tool(annotations=READ)
async def get_profile() -> str:
    """The user's name, username, time zone and public booking link."""
    me = await _api("GET", "/api/me")
    me["booking_link"] = f"{settings.FRONTEND_URL}/book/{me.get('username')}"
    return _out(me)


@mcp.tool(annotations=READ)
async def get_free_times(days: int = 7, min_minutes: int = 30) -> str:
    """The user's open time windows over the next `days` days (5, 7 or 14), from every connected
    calendar and their working hours, in their time zone. Use this to answer "when am I free?"."""
    return _out(await _api("GET", "/api/availability/summary", params={"days": days, "min_minutes": min_minutes}))


@mcp.tool(annotations=READ)
async def list_event_types() -> str:
    """The user's meeting types (name, length, location) with each one's booking link."""
    me = await _api("GET", "/api/me")
    types = await _api("GET", "/api/event-types")
    for t in types:
        t["booking_link"] = f"{settings.FRONTEND_URL}/book/{me.get('username')}/{t.get('slug')}"
    return _out(types)


@mcp.tool(annotations=READ)
async def list_bookings(status: Optional[str] = None) -> str:
    """Bookings guests have made on the user's booking page. `status`: confirmed or cancelled."""
    return _out(await _api("GET", "/api/bookings", params={"status": status}))


@mcp.tool(annotations=OUTWARD)
async def cancel_booking(booking_id: str) -> str:
    """Cancel a booking as the host. The guest is emailed and the invite is withdrawn.
    Confirm with the user first."""
    return _out(await _api("PATCH", f"/api/bookings/{booking_id}"))


# --- Group scheduling -----------------------------------------------------------------------

@mcp.tool(annotations=OUTWARD)
async def find_time_with(
    title: str,
    emails: list[str],
    duration_minutes: int = 30,
    window_start: Optional[date] = None,
    window_end: Optional[date] = None,
    note: Optional[str] = None,
    location: Optional[str] = None,
    send_invites: bool = True,
) -> str:
    """Find a time with other people: creates a group meeting and (by default) emails each person a
    link to pick the times that work, suggesting three of the user's free times. Dates bound the
    search (default: the next week). Confirm the people and the window with the user first."""
    body = {
        "title": title,
        "duration_minutes": duration_minutes,
        "window_start": window_start.isoformat() if window_start else None,
        "window_end": window_end.isoformat() if window_end else None,
        "note": note,
        "location": location,
        "participants": [{"email": e} for e in emails],
        "send_invites": send_invites,
    }
    return _out(await _api("POST", "/api/group-meetings", body={k: v for k, v in body.items() if v is not None}))


@mcp.tool(annotations=READ)
async def list_group_meetings() -> str:
    """The user's group meetings and their state (collecting answers, booked, cancelled)."""
    return _out(await _api("GET", "/api/group-meetings"))


@mcp.tool(annotations=READ)
async def get_group_meeting(meeting_id: str) -> str:
    """One group meeting: who has answered, and the candidate times ranked by how many can make them."""
    return _out(await _api("GET", f"/api/group-meetings/{meeting_id}"))


@mcp.tool(annotations=OUTWARD)
async def book_group_meeting(meeting_id: str, starts_at: str) -> str:
    """Book a group meeting at `starts_at` (ISO 8601, one of its candidate times): sends everyone a
    calendar invite. Confirm the time with the user first."""
    return _out(await _api("POST", f"/api/group-meetings/{meeting_id}/book", body={"starts_at": starts_at}))


@mcp.tool(annotations=OUTWARD)
async def remind_group_meeting(meeting_id: str) -> str:
    """Re-send the invite link to everyone who hasn't answered yet."""
    return _out(await _api("POST", f"/api/group-meetings/{meeting_id}/remind"))


@mcp.tool(annotations=OUTWARD)
async def cancel_group_meeting(meeting_id: str) -> str:
    """Cancel a group meeting; anyone already invited is told. Confirm with the user first."""
    return _out(await _api("POST", f"/api/group-meetings/{meeting_id}/cancel"))


# --- Calendars & schedules ------------------------------------------------------------------

@mcp.tool(annotations=READ)
async def list_calendars() -> str:
    """Connected calendars and their sync health (ok, retrying, or not syncing, with the reason)."""
    return _out(await _api("GET", "/api/calendars"))


@mcp.tool(annotations=WRITE)
async def add_calendar(name: str, ics_url: str) -> str:
    """Connect a calendar by its iCal/ICS link (Google, Outlook, iCloud and webcal:// links work).
    Its busy times then block the user's booking page."""
    return _out(await _api("POST", "/api/calendars", body={"name": name, "ics_url": ics_url}))


@mcp.tool(annotations=WRITE)
async def sync_calendars() -> str:
    """Re-sync every connected calendar now."""
    return _out(await _api("POST", "/api/calendars/sync-all"))


@mcp.tool(annotations=READ)
async def list_calendar_events(start: Optional[date] = None, end: Optional[date] = None) -> str:
    """Events from the user's connected calendars between `start` and `end` (default: the next 7 days)."""
    params = {"start": start.isoformat() if start else None, "end": end.isoformat() if end else None}
    if not start and not end:
        params["days"] = 7
    return _out(await _api("GET", "/api/calendars/cached-events", params=params))


@mcp.tool(annotations=WRITE)
async def import_schedule_text(text: str, name: Optional[str] = None) -> str:
    """Add a schedule to the user's calendar from pasted text (a soccer season, band rehearsals,
    a class timetable). Every date and time found becomes an event that blocks their booking page;
    it can be undone from TimeIQ's Calendars page."""
    return _out(await _api("POST", "/api/email-imports/text", body={"text": text, "name": name}))


@mcp.tool(annotations=READ)
async def get_schedule_email_address() -> str:
    """The user's private address for emailing schedules into TimeIQ, plus recent imports."""
    return _out(await _api("GET", "/api/email-imports"))


# --- Time & invoices ------------------------------------------------------------------------

@mcp.tool(annotations=READ)
async def list_clients() -> str:
    """The user's clients, with hourly rate, currency and billing emails."""
    return _out(await _api("GET", "/api/clients"))


@mcp.tool(annotations=WRITE)
async def log_time(client_id: str, entry_date: date, hours: float, description: str) -> str:
    """Log hours worked for a client on a date."""
    body = {"client_id": client_id, "entry_date": entry_date.isoformat(), "hours": hours, "description": description}
    return _out(await _api("POST", "/api/time-entries", body=body))


@mcp.tool(annotations=READ)
async def list_time_entries(start: Optional[date] = None, end: Optional[date] = None, client_id: Optional[str] = None) -> str:
    """Time entries between `start` and `end`, optionally for one client."""
    params = {"start": start.isoformat() if start else None, "end": end.isoformat() if end else None, "client_id": client_id}
    return _out(await _api("GET", "/api/time-entries", params=params))


@mcp.tool(annotations=READ)
async def get_hours_and_money() -> str:
    """This week's hours against the weekly target, unbilled amounts, outstanding invoices and
    this month's payments, per currency."""
    return _out(await _api("GET", "/api/dashboard/money"))


@mcp.tool(annotations=READ)
async def list_unbilled_time() -> str:
    """Unbilled hours and amounts per client."""
    return _out(await _api("GET", "/api/time-entries/summary"))


@mcp.tool(annotations=READ)
async def list_invoices() -> str:
    """The user's invoices with status (draft, sent, paid, overdue, void), totals and due dates."""
    return _out(await _api("GET", "/api/invoices"))


@mcp.tool(annotations=WRITE)
async def create_invoice(client_id: str, period_start: date, period_end: date, notes: Optional[str] = None) -> str:
    """Create a draft invoice for a client from the time logged in the period. Nothing is sent."""
    body = {"client_id": client_id, "period_start": period_start.isoformat(), "period_end": period_end.isoformat(), "notes": notes}
    return _out(await _api("POST", "/api/invoices", body={k: v for k, v in body.items() if v is not None}))


@mcp.tool(annotations=OUTWARD)
async def send_invoice(invoice_id: str) -> str:
    """Email an invoice to the client's billing contacts. Confirm with the user first."""
    return _out(await _api("POST", f"/api/invoices/{invoice_id}/send"))


# --- HTTP endpoint ----------------------------------------------------------------------------

def _unauthorized(detail: str) -> JSONResponse:
    return JSONResponse(
        {"error": "invalid_token", "error_description": detail},
        status_code=401,
        headers={"WWW-Authenticate": 'Bearer realm="TimeIQ"'},
    )


class MCPEndpoint:
    """ASGI app for /mcp: check the token, then serve the request on a fresh stateless manager."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        raw = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        if not raw:
            await _unauthorized("Create a token in TimeIQ → Settings → API tokens and send it as a Bearer token.")(scope, receive, send)
            return
        async with async_session() as db:
            user = await api_tokens.user_for(db, raw)
        if user is None:
            await _unauthorized("That TimeIQ token is invalid or has been revoked.")(scope, receive, send)
            return

        reset = _token.set(raw)
        try:
            manager = StreamableHTTPSessionManager(app=mcp._lowlevel_server, stateless=True, json_response=True)
            async with manager.run():
                await manager.asgi_app(scope, receive, send)
        finally:
            _token.reset(reset)
