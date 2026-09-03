# Time Tracking and Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user log daily hours per client and generate, email, and track invoices built from those hours, with a hosted public invoice page and a calendar import helper.

**Architecture:** Three new SQLAlchemy models (Client, TimeEntry, Invoice + InvoiceLine) in the existing `timeiq` schema, three new FastAPI routers following the bookings router pattern, a ReportLab PDF service, and a Resend email function. Frontend adds three dashboard pages plus one public page, all through the existing `apiFetch` client and shadcn components.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, ReportLab, Resend, pytest; Next.js 16 app router, React 19, Tailwind, shadcn/ui, date-fns.

**Spec:** `docs/superpowers/specs/2026-09-02-time-tracking-invoicing-design.md`

## Global Constraints

- All tables in schema `timeiq`, all rows owned by `user_id` with cascade delete, matching existing models.
- Alembic revision IDs must be 32 chars or fewer. New migration id: `006_time_invoices`, revises `005_feed_token`.
- Backend runs on Vercel Python serverless. Only pure-Python deps. Add `reportlab>=4.0`, `pytest>=8.0`, `pytest-asyncio>=0.23`.
- Invoice numbers formatted `INV-0001` from `users.next_invoice_number`.
- Invoice statuses: `draft`, `sent`, `paid`, `void`.
- Money: `Decimal`, rounded `ROUND_HALF_UP` to cents.
- Frontend public route is `/invoice/[token]`; Clerk matcher entry must be `/invoice/(.*)` so `/invoices` stays protected.
- Per project rule: commit and push after each task so Vercel deploys. Migrations run manually with `cd backend && alembic upgrade head`.
- Backend commands run from `backend/` with `.venv/bin/python` / `.venv/bin/pytest`.

---

### Task 1: Pure invoicing helpers (TDD)

**Files:**
- Create: `backend/app/services/invoicing.py`
- Create: `backend/tests/__init__.py` (empty), `backend/tests/test_invoicing.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces:
  - `line_amount(hours: Decimal, rate: Decimal) -> Decimal` (cents, half-up)
  - `format_invoice_number(n: int) -> str` → `"INV-0001"`
  - `duration_to_hours(starts_at: datetime, ends_at: datetime) -> Decimal` (nearest 0.25, min 0.25)
  - `parse_keywords(raw: str | None) -> list[str]` (lowercased, trimmed, empties dropped)
  - `title_matches(title: str | None, keywords: list[str]) -> bool`

- [ ] **Step 1: Add deps**

Append to `backend/requirements.txt`:

```
reportlab>=4.0
pytest>=8.0
pytest-asyncio>=0.23
```

Run: `cd backend && .venv/bin/pip install -r requirements.txt -q`

- [ ] **Step 2: Write failing tests**

`backend/tests/test_invoicing.py`:

```python
from datetime import datetime, timezone
from decimal import Decimal

from app.services.invoicing import (
    duration_to_hours,
    format_invoice_number,
    line_amount,
    parse_keywords,
    title_matches,
)


def test_line_amount_rounds_half_up_to_cents():
    assert line_amount(Decimal("1.25"), Decimal("150.00")) == Decimal("187.50")
    assert line_amount(Decimal("0.33"), Decimal("100.00")) == Decimal("33.00")
    assert line_amount(Decimal("1.005"), Decimal("1")) == Decimal("1.01")


def test_format_invoice_number_pads_to_four():
    assert format_invoice_number(1) == "INV-0001"
    assert format_invoice_number(12345) == "INV-12345"


def test_duration_to_hours_rounds_to_quarter_with_minimum():
    s = datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc)
    assert duration_to_hours(s, s.replace(hour=10)) == Decimal("1.00")
    assert duration_to_hours(s, s.replace(minute=50)) == Decimal("0.75")
    assert duration_to_hours(s, s.replace(minute=5)) == Decimal("0.25")
    assert duration_to_hours(s, s.replace(hour=10, minute=8)) == Decimal("1.25")


def test_parse_keywords_normalises():
    assert parse_keywords(" Acme, acme corp ,,ACME ") == ["acme", "acme corp"]
    assert parse_keywords(None) == []


def test_title_matches_is_case_insensitive_substring():
    kws = parse_keywords("acme, standup")
    assert title_matches("Weekly ACME sync", kws)
    assert title_matches("standup", kws)
    assert not title_matches("Dentist", kws)
    assert not title_matches(None, kws)
    assert not title_matches("anything", [])
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_invoicing.py -q`
Expected: ImportError on `app.services.invoicing`.

- [ ] **Step 4: Implement**

`backend/app/services/invoicing.py`:

```python
from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")
QUARTER = Decimal("0.25")


def line_amount(hours: Decimal, rate: Decimal) -> Decimal:
    return (Decimal(hours) * Decimal(rate)).quantize(CENTS, rounding=ROUND_HALF_UP)


def format_invoice_number(n: int) -> str:
    return f"INV-{n:04d}"


def duration_to_hours(starts_at: datetime, ends_at: datetime) -> Decimal:
    minutes = Decimal((ends_at - starts_at).total_seconds()) / Decimal(60)
    hours = (minutes / Decimal(60) / QUARTER).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    ) * QUARTER
    if hours < QUARTER:
        hours = QUARTER
    return hours.quantize(CENTS)


def parse_keywords(raw: str | None) -> list[str]:
    if not raw:
        return []
    seen: list[str] = []
    for part in raw.split(","):
        kw = part.strip().lower()
        if kw and kw not in seen:
            seen.append(kw)
    return seen


def title_matches(title: str | None, keywords: list[str]) -> bool:
    if not title or not keywords:
        return False
    lowered = title.lower()
    return any(kw in lowered for kw in keywords)
```

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv/bin/pytest tests/test_invoicing.py -q`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/tests backend/app/services/invoicing.py
git commit -m "Add invoicing math and keyword helpers with tests"
```

---

### Task 2: Models, user counter, migration

**Files:**
- Create: `backend/app/models/client.py`, `backend/app/models/time_entry.py`, `backend/app/models/invoice.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/models/user.py`, `backend/app/main.py:13-20`
- Create: `backend/alembic/versions/006_add_time_tracking_and_invoices.py`

**Interfaces:**
- Produces ORM classes `Client`, `TimeEntry`, `Invoice`, `InvoiceLine`; `User.next_invoice_number: int`; relationships `Invoice.lines`, `Client.time_entries`, `TimeEntry.client`, `TimeEntry.invoice`.

- [ ] **Step 1: Client model**

`backend/app/models/client.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    payment_terms_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    match_keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="clients")
    time_entries = relationship("TimeEntry", back_populates="client", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="client", cascade="all, delete-orphan")
```

- [ ] **Step 2: TimeEntry model**

`backend/app/models/time_entry.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TimeEntry(Base):
    __tablename__ = "time_entries"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc),
    )

    client = relationship("Client", back_populates="time_entries")
    invoice = relationship("Invoice", back_populates="time_entries")
```

- [ ] **Step 3: Invoice and InvoiceLine models**

`backend/app/models/invoice.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

INVOICE_STATUSES = ("draft", "sent", "paid", "void")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("user_id", "number", name="uq_invoices_user_id_number"),
        {"schema": "timeiq"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft")
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_billing_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    client_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="invoices")
    client = relationship("Client", back_populates="invoices")
    lines = relationship(
        "InvoiceLine", back_populates="invoice", cascade="all, delete-orphan",
        order_by="InvoiceLine.line_date",
    )
    time_entries = relationship("TimeEntry", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = {"schema": "timeiq"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timeiq.invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    time_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    line_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="lines")
```

- [ ] **Step 4: Wire into User and package**

In `backend/app/models/user.py` add after `feed_obfuscate`:

```python
    next_invoice_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
```

(add `Integer` to the sqlalchemy import) and after the `bookings` relationship:

```python
    clients = relationship("Client", back_populates="user", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="user", cascade="all, delete-orphan")
```

`backend/app/models/__init__.py`: import and export `Client`, `TimeEntry`, `Invoice`, `InvoiceLine`. Add the same four names to the model import in `backend/app/main.py`.

- [ ] **Step 5: Migration**

`backend/alembic/versions/006_add_time_tracking_and_invoices.py`:

```python
"""Add clients, time_entries, invoices, invoice_lines and users.next_invoice_number

Revision ID: 006_time_invoices
Revises: 005_feed_token
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006_time_invoices"
down_revision: Union[str, None] = "005_feed_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = "timeiq"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("next_invoice_number", sa.Integer, nullable=False, server_default="1"),
        schema=S,
    )
    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("billing_email", sa.String(320)),
        sa.Column("address", sa.Text),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("payment_terms_days", sa.Integer, nullable=False, server_default="30"),
        sa.Column("match_keywords", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema=S,
    )
    op.create_index("ix_clients_user_id", "clients", ["user_id"], schema=S)

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_contact_name", sa.String(255)),
        sa.Column("client_billing_email", sa.String(320)),
        sa.Column("client_address", sa.Text),
        sa.Column("notes", sa.Text),
        sa.Column("public_token", sa.String(64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "number", name="uq_invoices_user_id_number"),
        sa.UniqueConstraint("public_token", name="uq_invoices_public_token"),
        schema=S,
    )
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"], schema=S)
    op.create_index("ix_invoices_client_id", "invoices", ["client_id"], schema=S)

    op.create_table(
        "invoice_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("time_entry_id", postgresql.UUID(as_uuid=True)),
        sa.Column("line_date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("hours", sa.Numeric(6, 2), nullable=False),
        sa.Column("rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        schema=S,
    )
    op.create_index("ix_invoice_lines_invoice_id", "invoice_lines", ["invoice_id"], schema=S)

    op.create_table(
        "time_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.invoices.id", ondelete="SET NULL")),
        sa.Column("entry_date", sa.Date, nullable=False),
        sa.Column("hours", sa.Numeric(6, 2), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema=S,
    )
    op.create_index("ix_time_entries_user_id", "time_entries", ["user_id"], schema=S)
    op.create_index("ix_time_entries_client_id", "time_entries", ["client_id"], schema=S)
    op.create_index("ix_time_entries_invoice_id", "time_entries", ["invoice_id"], schema=S)
    op.create_index("ix_time_entries_entry_date", "time_entries", ["entry_date"], schema=S)


def downgrade() -> None:
    op.drop_table("time_entries", schema=S)
    op.drop_table("invoice_lines", schema=S)
    op.drop_table("invoices", schema=S)
    op.drop_table("clients", schema=S)
    op.drop_column("users", "next_invoice_number", schema=S)
```

- [ ] **Step 6: Verify**

Run: `cd backend && .venv/bin/python -c "from app.main import app; print('ok')"` → `ok`.
Run: `cd backend && .venv/bin/alembic upgrade head` → applies `006_time_invoices`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models backend/app/main.py backend/alembic/versions/006_add_time_tracking_and_invoices.py
git commit -m "Add client, time entry, and invoice models with migration"
```

---

### Task 3: Clients API

**Files:**
- Create: `backend/app/schemas/client.py`, `backend/app/routers/clients.py`
- Modify: `backend/app/main.py` (import and include router)

**Interfaces:**
- Produces routes `GET/POST /api/clients`, `PATCH/DELETE /api/clients/{id}`; schemas `ClientCreate`, `ClientUpdate`, `ClientResponse` (includes `unbilled_hours`, `unbilled_amount`).
- Produces helper `get_owned_client(db, user, client_id) -> Client` (404 if missing) reused by later routers.

- [ ] **Step 1: Schemas**

`backend/app/schemas/client.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    billing_email: Optional[EmailStr] = None
    address: Optional[str] = None
    hourly_rate: Decimal = Field(..., ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    match_keywords: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    billing_email: Optional[EmailStr] = None
    address: Optional[str] = None
    hourly_rate: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    payment_terms_days: Optional[int] = Field(default=None, ge=0, le=365)
    match_keywords: Optional[str] = None


class ClientResponse(BaseModel):
    id: uuid.UUID
    name: str
    contact_name: Optional[str] = None
    billing_email: Optional[str] = None
    address: Optional[str] = None
    hourly_rate: Decimal
    currency: str
    payment_terms_days: int
    match_keywords: Optional[str] = None
    unbilled_hours: Decimal = Decimal("0")
    unbilled_amount: Decimal = Decimal("0")
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Router**

`backend/app/routers/clients.py`:

```python
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
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == user.id)
    )
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


async def unbilled_hours_by_client(db: AsyncSession, user: User) -> dict[uuid.UUID, Decimal]:
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
async def list_clients(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Client).where(Client.user_id == user.id).order_by(Client.name.asc())
    )
    unbilled = await unbilled_hours_by_client(db, user)
    return [to_response(c, unbilled) for c in result.scalars().all()]


@router.post("/api/clients", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
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
    client_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    client = await get_owned_client(db, user, client_id)
    await db.delete(client)
    await db.flush()
```

Register in `backend/app/main.py`: add `clients` to the routers import and `app.include_router(clients.router)`.

- [ ] **Step 3: Verify**

Run: `cd backend && .venv/bin/python -c "from app.main import app; print([r.path for r in app.routes if 'clients' in r.path])"`
Expected: the two client paths.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/client.py backend/app/routers/clients.py backend/app/main.py
git commit -m "Add clients API"
```

---

### Task 4: Time entries API

**Files:**
- Create: `backend/app/schemas/time_entry.py`, `backend/app/routers/time_entries.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes `get_owned_client`, `unbilled_hours_by_client` from Task 3, `line_amount` from Task 1.
- Produces routes: `GET /api/time-entries` (filters `client_id`, `start`, `end`), `POST /api/time-entries`, `POST /api/time-entries/bulk`, `GET /api/time-entries/summary`, `PATCH/DELETE /api/time-entries/{id}`. Schemas `TimeEntryCreate`, `TimeEntryUpdate`, `TimeEntryResponse`, `UnbilledSummary`.

- [ ] **Step 1: Schemas**

`backend/app/schemas/time_entry.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class TimeEntryCreate(BaseModel):
    client_id: uuid.UUID
    entry_date: date
    hours: Decimal = Field(..., gt=0, le=24, decimal_places=2)
    description: str = Field(..., min_length=1)


class TimeEntryBulkCreate(BaseModel):
    entries: list[TimeEntryCreate] = Field(..., min_length=1, max_length=200)


class TimeEntryUpdate(BaseModel):
    client_id: Optional[uuid.UUID] = None
    entry_date: Optional[date] = None
    hours: Optional[Decimal] = Field(default=None, gt=0, le=24, decimal_places=2)
    description: Optional[str] = Field(default=None, min_length=1)


class TimeEntryResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    entry_date: date
    hours: Decimal
    description: str
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UnbilledSummary(BaseModel):
    client_id: uuid.UUID
    client_name: str
    currency: str
    unbilled_hours: Decimal
    unbilled_amount: Decimal
```

- [ ] **Step 2: Router**

`backend/app/routers/time_entries.py`:

```python
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.client import Client
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.routers.clients import get_owned_client, unbilled_hours_by_client
from app.schemas.time_entry import (
    TimeEntryBulkCreate,
    TimeEntryCreate,
    TimeEntryResponse,
    TimeEntryUpdate,
    UnbilledSummary,
)
from app.services.invoicing import line_amount

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


async def get_owned_entry(db: AsyncSession, user: User, entry_id: uuid.UUID) -> TimeEntry:
    result = await db.execute(
        select(TimeEntry)
        .options(*ENTRY_LOAD)
        .where(TimeEntry.id == entry_id, TimeEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found")
    return entry


def reject_if_billed(entry: TimeEntry) -> None:
    if entry.invoice_id is not None:
        number = entry.invoice.number if entry.invoice else "an invoice"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Entry is on invoice {number}"
        )


@router.get("/api/time-entries/summary", response_model=list[UnbilledSummary])
async def unbilled_summary(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    unbilled = await unbilled_hours_by_client(db, user)
    if not unbilled:
        return []
    result = await db.execute(
        select(Client).where(Client.id.in_(unbilled.keys())).order_by(Client.name.asc())
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


@router.post("/api/time-entries", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    data: TimeEntryCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await get_owned_client(db, user, data.client_id)
    entry = TimeEntry(user_id=user.id, **data.model_dump())
    db.add(entry)
    await db.flush()
    return to_response(await get_owned_entry(db, user, entry.id))


@router.post("/api/time-entries/bulk", response_model=list[TimeEntryResponse], status_code=status.HTTP_201_CREATED)
async def create_entries_bulk(
    data: TimeEntryBulkCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    for client_id in {e.client_id for e in data.entries}:
        await get_owned_client(db, user, client_id)
    entries = [TimeEntry(user_id=user.id, **e.model_dump()) for e in data.entries]
    db.add_all(entries)
    await db.flush()
    ids = [e.id for e in entries]
    result = await db.execute(
        select(TimeEntry).options(*ENTRY_LOAD).where(TimeEntry.id.in_(ids))
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
    db.expire(entry, ["client"])
    return to_response(await get_owned_entry(db, user, entry.id))


@router.delete("/api/time-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    entry = await get_owned_entry(db, user, entry_id)
    reject_if_billed(entry)
    await db.delete(entry)
    await db.flush()
```

Register `time_entries.router` in `main.py`. The `/summary` route is declared before `/{entry_id}` so it is matched first.

- [ ] **Step 3: Verify and commit**

Run: `cd backend && .venv/bin/python -c "from app.main import app; print('ok')"`.

```bash
git add backend/app/schemas/time_entry.py backend/app/routers/time_entries.py backend/app/main.py
git commit -m "Add time entries API"
```

---

### Task 5: Invoice PDF service (TDD)

**Files:**
- Create: `backend/app/services/invoice_pdf.py`, `backend/tests/test_invoice_pdf.py`

**Interfaces:**
- Produces `build_invoice_pdf(invoice: Invoice, sender_name: str, sender_email: str) -> bytes`. Reads `invoice.lines`.

- [ ] **Step 1: Failing test**

`backend/tests/test_invoice_pdf.py`:

```python
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services.invoice_pdf import build_invoice_pdf


def _invoice():
    lines = [
        SimpleNamespace(line_date=date(2026, 8, 3), description="Auth refactor", hours=Decimal("2.50"), rate=Decimal("150.00"), amount=Decimal("375.00")),
        SimpleNamespace(line_date=date(2026, 8, 4), description="Bug triage & <fixes>", hours=Decimal("1.00"), rate=Decimal("150.00"), amount=Decimal("150.00")),
    ]
    return SimpleNamespace(
        id=uuid.uuid4(), number="INV-0007", status="draft",
        issue_date=date(2026, 9, 1), due_date=date(2026, 10, 1),
        period_start=date(2026, 8, 1), period_end=date(2026, 8, 31),
        currency="USD", hourly_rate=Decimal("150.00"), subtotal=Decimal("525.00"),
        client_name="Acme Corp", client_contact_name="Jane Doe",
        client_billing_email="ap@acme.example", client_address="1 Main St\nSpringfield",
        notes="Thanks!", lines=lines,
    )


def test_build_invoice_pdf_returns_pdf_bytes():
    pdf = build_invoice_pdf(_invoice(), "Elon Zito", "elon@example.com")
    assert isinstance(pdf, bytes)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000
```

Run: `cd backend && .venv/bin/pytest tests/test_invoice_pdf.py -q` → ImportError.

- [ ] **Step 2: Implement**

`backend/app/services/invoice_pdf.py`:

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def fmt_money(amount: Decimal, currency: str) -> str:
    return f"{currency} {Decimal(amount):,.2f}"


def fmt_date(d: date) -> str:
    return d.strftime("%b %d, %Y")


def _p(text: str, style) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def build_invoice_pdf(invoice, sender_name: str, sender_email: str) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER, leftMargin=0.8 * inch, rightMargin=0.8 * inch,
        topMargin=0.8 * inch, bottomMargin=0.8 * inch, title=invoice.number,
    )
    ss = getSampleStyleSheet()
    body = ss["BodyText"]
    small = ParagraphStyle("small", parent=body, fontSize=9, leading=12, textColor=colors.HexColor("#555555"))
    right = ParagraphStyle("right", parent=body, alignment=TA_RIGHT)
    h1 = ParagraphStyle("h1", parent=ss["Title"], alignment=TA_RIGHT, fontSize=22, leading=26)
    label = ParagraphStyle("label", parent=small, fontName="Helvetica-Bold")

    terms_days = (invoice.due_date - invoice.issue_date).days
    header = Table(
        [[
            [_p(sender_name, ss["Heading3"]), _p(sender_email, small)],
            [
                _p("INVOICE", h1),
                _p(invoice.number, right),
                _p(f"Issued {fmt_date(invoice.issue_date)}", right),
                _p(f"Due {fmt_date(invoice.due_date)}", right),
            ],
        ]],
        colWidths=[3.5 * inch, 3.4 * inch],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    bill_to = [_p("BILL TO", label), _p(invoice.client_name, body)]
    if invoice.client_contact_name:
        bill_to.append(_p(invoice.client_contact_name, body))
    if invoice.client_address:
        bill_to.append(_p(invoice.client_address, body))
    if invoice.client_billing_email:
        bill_to.append(_p(invoice.client_billing_email, small))
    period = [
        _p("PERIOD", label),
        _p(f"{fmt_date(invoice.period_start)} to {fmt_date(invoice.period_end)}", body),
        Spacer(1, 6),
        _p("RATE", label),
        _p(f"{fmt_money(invoice.hourly_rate, invoice.currency)} / hour", body),
    ]
    meta = Table([[bill_to, period]], colWidths=[3.5 * inch, 3.4 * inch])
    meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    rows = [["Date", "Description", "Hours", "Rate", "Amount"]]
    for line in invoice.lines:
        rows.append([
            fmt_date(line.line_date),
            _p(line.description, body),
            f"{Decimal(line.hours):.2f}",
            f"{Decimal(line.rate):,.2f}",
            f"{Decimal(line.amount):,.2f}",
        ])
    total_hours = sum((Decimal(l.hours) for l in invoice.lines), Decimal("0"))
    rows.append(["", "Total", f"{total_hours:.2f}", "", fmt_money(invoice.subtotal, invoice.currency)])

    table = Table(rows, colWidths=[1.0 * inch, 3.3 * inch, 0.7 * inch, 0.9 * inch, 1.0 * inch], repeatRows=1)
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#e5e7eb")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#1f2937")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(rows) - 1):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f9fafb")))
    table.setStyle(TableStyle(style))

    story = [header, Spacer(1, 18), meta, Spacer(1, 18), table, Spacer(1, 18)]
    story.append(_p(f"Payment due within {terms_days} days of the issue date.", small))
    if invoice.notes:
        story += [Spacer(1, 10), _p("NOTES", label), _p(invoice.notes, body)]

    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 3: Run test, commit**

Run: `cd backend && .venv/bin/pytest -q` → all pass.

```bash
git add backend/app/services/invoice_pdf.py backend/tests/test_invoice_pdf.py
git commit -m "Add ReportLab invoice PDF builder"
```

---

### Task 6: Invoice email

**Files:**
- Modify: `backend/app/services/email.py` (append)

**Interfaces:**
- Produces `send_invoice(invoice: Invoice, pdf_bytes: bytes, sender: User, hosted_url: str) -> None`. Raises `RuntimeError` on Resend failure.

- [ ] **Step 1: Implement**

Append to `backend/app/services/email.py`:

```python
def send_invoice(invoice, pdf_bytes: bytes, sender: User, hosted_url: str) -> None:
    """Email an invoice PDF to the client's billing email."""
    import base64
    from app.services.invoice_pdf import fmt_date, fmt_money

    _init_resend()
    sender_name = sender.name or sender.email
    greeting_name = invoice.client_contact_name or invoice.client_name
    amount = fmt_money(invoice.subtotal, invoice.currency)
    try:
        resend.Emails.send(
            {
                "from": FROM_EMAIL,
                "to": [invoice.client_billing_email],
                "reply_to": sender.email,
                "subject": f"Invoice {invoice.number} from {sender_name}",
                "html": (
                    f"<p>Hi {html_escape(greeting_name)},</p>"
                    f"<p>Please find attached invoice <strong>{html_escape(invoice.number)}</strong> "
                    f"for {html_escape(fmt_date(invoice.period_start))} to "
                    f"{html_escape(fmt_date(invoice.period_end))}.</p>"
                    f"<p><strong>Amount due:</strong> {html_escape(amount)}<br/>"
                    f"<strong>Due date:</strong> {html_escape(fmt_date(invoice.due_date))}</p>"
                    f'<p><a href="{hosted_url}">View invoice online</a></p>'
                    f"<p>Thank you,<br/>{html_escape(sender_name)}</p>"
                ),
                "attachments": [
                    {
                        "filename": f"{invoice.number}.pdf",
                        "content": base64.b64encode(pdf_bytes).decode("ascii"),
                        "content_type": "application/pdf",
                    }
                ],
            }
        )
    except Exception as exc:
        logger.error("Failed to send invoice %s: %s", invoice.number, exc)
        raise RuntimeError("Failed to send invoice email") from exc
```

- [ ] **Step 2: Verify import and commit**

Run: `cd backend && .venv/bin/python -c "from app.services.email import send_invoice; print('ok')"`.

```bash
git add backend/app/services/email.py
git commit -m "Add invoice email with PDF attachment"
```

---

### Task 7: Invoices API and public invoice endpoints

**Files:**
- Create: `backend/app/schemas/invoice.py`, `backend/app/routers/invoices.py`
- Modify: `backend/app/routers/public.py` (append), `backend/app/main.py`

**Interfaces:**
- Consumes `get_owned_client` (Task 3), `line_amount`, `format_invoice_number` (Task 1), `build_invoice_pdf` (Task 5), `send_invoice` (Task 6).
- Produces routes listed in the spec under Invoices and Public.

- [ ] **Step 1: Schemas**

`backend/app/schemas/invoice.py`:

```python
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class InvoiceCreate(BaseModel):
    client_id: uuid.UUID
    period_start: date
    period_end: date
    notes: Optional[str] = None

    @model_validator(mode="after")
    def check_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class InvoiceUpdate(BaseModel):
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class InvoicePreview(BaseModel):
    entry_count: int
    total_hours: Decimal
    subtotal: Decimal
    currency: str


class InvoiceLineResponse(BaseModel):
    id: uuid.UUID
    time_entry_id: Optional[uuid.UUID] = None
    line_date: date
    description: str
    hours: Decimal
    rate: Decimal
    amount: Decimal

    model_config = {"from_attributes": True}


class InvoiceSummary(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    number: str
    status: str
    issue_date: date
    due_date: date
    period_start: date
    period_end: date
    currency: str
    subtotal: Decimal
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceResponse(InvoiceSummary):
    hourly_rate: Decimal
    client_contact_name: Optional[str] = None
    client_billing_email: Optional[str] = None
    client_address: Optional[str] = None
    notes: Optional[str] = None
    public_token: str
    lines: list[InvoiceLineResponse] = Field(default_factory=list)


class PublicInvoiceResponse(BaseModel):
    number: str
    status: str
    issue_date: date
    due_date: date
    period_start: date
    period_end: date
    currency: str
    hourly_rate: Decimal
    subtotal: Decimal
    client_name: str
    client_contact_name: Optional[str] = None
    client_billing_email: Optional[str] = None
    client_address: Optional[str] = None
    notes: Optional[str] = None
    sender_name: str
    sender_email: str
    lines: list[InvoiceLineResponse]
```

- [ ] **Step 2: Router**

`backend/app/routers/invoices.py`:

```python
from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.invoice import Invoice, InvoiceLine
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.routers.clients import get_owned_client
from app.schemas.invoice import (
    InvoiceCreate,
    InvoicePreview,
    InvoiceResponse,
    InvoiceSummary,
    InvoiceUpdate,
)
from app.services.email import send_invoice
from app.services.invoice_pdf import build_invoice_pdf
from app.services.invoicing import format_invoice_number, line_amount

router = APIRouter(tags=["invoices"])


async def get_owned_invoice(db: AsyncSession, user: User, invoice_id: uuid.UUID) -> Invoice:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines), selectinload(Invoice.client))
        .where(Invoice.id == invoice_id, Invoice.user_id == user.id)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


def require_status(invoice: Invoice, *allowed: str) -> None:
    if invoice.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice is {invoice.status}; action requires {' or '.join(allowed)}",
        )


def to_summary(invoice: Invoice) -> InvoiceSummary:
    data = InvoiceSummary.model_validate(invoice)
    data.client_name = invoice.client_name
    return data


def to_response(invoice: Invoice) -> InvoiceResponse:
    return InvoiceResponse.model_validate(invoice)


async def unbilled_entries(db: AsyncSession, user: User, client_id: uuid.UUID, start: date, end: date):
    result = await db.execute(
        select(TimeEntry)
        .where(
            TimeEntry.user_id == user.id,
            TimeEntry.client_id == client_id,
            TimeEntry.invoice_id.is_(None),
            TimeEntry.entry_date >= start,
            TimeEntry.entry_date <= end,
        )
        .order_by(TimeEntry.entry_date.asc(), TimeEntry.created_at.asc())
    )
    return result.scalars().all()


async def release_entries(db: AsyncSession, invoice: Invoice) -> None:
    await db.execute(
        update(TimeEntry).where(TimeEntry.invoice_id == invoice.id).values(invoice_id=None)
    )


@router.get("/api/invoices/preview", response_model=InvoicePreview)
async def preview_invoice(
    client_id: uuid.UUID = Query(...),
    period_start: date = Query(...),
    period_end: date = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_owned_client(db, user, client_id)
    entries = await unbilled_entries(db, user, client_id, period_start, period_end)
    hours = sum((Decimal(e.hours) for e in entries), Decimal("0"))
    subtotal = sum((line_amount(e.hours, client.hourly_rate) for e in entries), Decimal("0"))
    return InvoicePreview(
        entry_count=len(entries), total_hours=hours, subtotal=subtotal, currency=client.currency
    )


@router.post("/api/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    data: InvoiceCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    client = await get_owned_client(db, user, data.client_id)
    entries = await unbilled_entries(db, user, client.id, data.period_start, data.period_end)
    if not entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No unbilled time entries in that period",
        )

    today = datetime.now(timezone.utc).date()
    invoice = Invoice(
        user_id=user.id,
        client_id=client.id,
        number=format_invoice_number(user.next_invoice_number),
        status="draft",
        issue_date=today,
        due_date=today + timedelta(days=client.payment_terms_days),
        period_start=data.period_start,
        period_end=data.period_end,
        currency=client.currency,
        hourly_rate=client.hourly_rate,
        client_name=client.name,
        client_contact_name=client.contact_name,
        client_billing_email=client.billing_email,
        client_address=client.address,
        notes=data.notes,
        public_token=secrets.token_urlsafe(32),
    )
    user.next_invoice_number += 1
    db.add(invoice)
    await db.flush()

    subtotal = Decimal("0")
    for entry in entries:
        amount = line_amount(entry.hours, client.hourly_rate)
        subtotal += amount
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                time_entry_id=entry.id,
                line_date=entry.entry_date,
                description=entry.description,
                hours=entry.hours,
                rate=client.hourly_rate,
                amount=amount,
            )
        )
        entry.invoice_id = invoice.id
    invoice.subtotal = subtotal
    await db.flush()
    return to_response(await get_owned_invoice(db, user, invoice.id))


@router.get("/api/invoices", response_model=list[InvoiceSummary])
async def list_invoices(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at.desc())
    )
    return [to_summary(i) for i in result.scalars().all()]


@router.get("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return to_response(await get_owned_invoice(db, user, invoice_id))


@router.patch("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: uuid.UUID,
    data: InvoiceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(invoice, key, value)
    if invoice.due_date < invoice.issue_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date is before issue date")
    await db.flush()
    return to_response(invoice)


@router.post("/api/invoices/{invoice_id}/send", response_model=InvoiceResponse)
async def send_invoice_route(
    invoice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft", "sent")
    if not invoice.client_billing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client has no billing email. Add one to the client, then void and recreate this invoice.",
        )
    pdf = build_invoice_pdf(invoice, user.name or user.email, user.email)
    hosted_url = f"{settings.FRONTEND_URL}/invoice/{invoice.public_token}"
    try:
        send_invoice(invoice, pdf, user, hosted_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    invoice.status = "sent"
    invoice.sent_at = datetime.now(timezone.utc)
    await db.flush()
    return to_response(invoice)


@router.post("/api/invoices/{invoice_id}/mark-paid", response_model=InvoiceResponse)
async def mark_paid(
    invoice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "sent")
    invoice.status = "paid"
    invoice.paid_at = datetime.now(timezone.utc)
    await db.flush()
    return to_response(invoice)


@router.post("/api/invoices/{invoice_id}/void", response_model=InvoiceResponse)
async def void_invoice(
    invoice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft", "sent")
    await release_entries(db, invoice)
    invoice.status = "void"
    await db.flush()
    return to_response(invoice)


@router.delete("/api/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(
    invoice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    require_status(invoice, "draft")
    await release_entries(db, invoice)
    await db.delete(invoice)
    await db.flush()


@router.get("/api/invoices/{invoice_id}/pdf")
async def download_pdf(
    invoice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    invoice = await get_owned_invoice(db, user, invoice_id)
    pdf = build_invoice_pdf(invoice, user.name or user.email, user.email)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.number}.pdf"'},
    )
```

Register `invoices.router` in `main.py`. `/preview` is declared before `/{invoice_id}`.

- [ ] **Step 3: Public endpoints**

Append to `backend/app/routers/public.py`:

```python
from app.models.invoice import Invoice
from app.schemas.invoice import PublicInvoiceResponse
from app.services.invoice_pdf import build_invoice_pdf


async def _public_invoice(token: str, db: AsyncSession) -> tuple[Invoice, User]:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines), selectinload(Invoice.user))
        .where(Invoice.public_token == token)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None or invoice.status == "void":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice, invoice.user


@router.get("/api/public/invoices/{token}", response_model=PublicInvoiceResponse)
async def public_invoice(token: str, db: AsyncSession = Depends(get_db)):
    invoice, sender = await _public_invoice(token, db)
    data = PublicInvoiceResponse.model_validate(
        {**invoice.__dict__, "lines": invoice.lines,
         "sender_name": sender.name or sender.email, "sender_email": sender.email},
        from_attributes=True,
    )
    return data


@router.get("/api/public/invoices/{token}/pdf")
async def public_invoice_pdf(token: str, db: AsyncSession = Depends(get_db)):
    invoice, sender = await _public_invoice(token, db)
    pdf = build_invoice_pdf(invoice, sender.name or sender.email, sender.email)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.number}.pdf"'},
    )
```

Note: the public router already imports `Depends`, `HTTPException`, `Response`, `status`, `select`, `selectinload`, `AsyncSession`, `get_db`, `User`. The `router` has prefix `/api/public`, so use paths `"/invoices/{token}"` and `"/invoices/{token}/pdf"` in the decorators.

- [ ] **Step 4: Smoke test against local API**

Run the API: `cd backend && .venv/bin/uvicorn app.main:app --port 8000` and hit `/api/health`. Use a Clerk session token from the browser to `POST /api/clients`, `POST /api/time-entries`, `POST /api/invoices`, `GET /api/invoices/{id}/pdf`, and `GET /api/public/invoices/{token}`; confirm 201/200 and that the PDF opens.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/invoice.py backend/app/routers/invoices.py backend/app/routers/public.py backend/app/main.py
git commit -m "Add invoices API and public invoice endpoints"
```

---

### Task 8: Calendar suggestions endpoint (TDD on helpers already done)

**Files:**
- Modify: `backend/app/routers/time_entries.py`, `backend/app/schemas/time_entry.py`

**Interfaces:**
- Consumes `parse_keywords`, `title_matches`, `duration_to_hours` (Task 1), `CachedEvent` model.
- Produces `POST /api/time-entries/suggest` with `SuggestRequest{client_id, start, end}` → `list[SuggestedEntry{external_id, title, entry_date, hours, starts_at, ends_at}]`.

- [ ] **Step 1: Schemas**

Append to `backend/app/schemas/time_entry.py`:

```python
class SuggestRequest(BaseModel):
    client_id: uuid.UUID
    start: date
    end: date


class SuggestedEntry(BaseModel):
    external_id: Optional[str] = None
    title: str
    entry_date: date
    hours: Decimal
    starts_at: datetime
    ends_at: datetime
```

- [ ] **Step 2: Route**

Add to `backend/app/routers/time_entries.py` (imports: `datetime, time, timezone` from datetime, `ZoneInfo`, `CachedEvent`, `SuggestRequest`, `SuggestedEntry`, `duration_to_hours`, `parse_keywords`, `title_matches`). Declare before `/{entry_id}` routes.

```python
@router.post("/api/time-entries/suggest", response_model=list[SuggestedEntry])
async def suggest_entries(
    data: SuggestRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    client = await get_owned_client(db, user, data.client_id)
    keywords = parse_keywords(client.match_keywords)
    if not keywords:
        return []
    tz = ZoneInfo(user.timezone or "UTC")
    range_start = datetime.combine(data.start, time.min, tzinfo=tz)
    range_end = datetime.combine(data.end, time.max, tzinfo=tz)

    events = (
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
    ).scalars().all()

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
```

- [ ] **Step 3: Verify and commit**

Run: `cd backend && .venv/bin/pytest -q && .venv/bin/python -c "from app.main import app"`.

```bash
git add backend/app/routers/time_entries.py backend/app/schemas/time_entry.py
git commit -m "Add calendar-based time entry suggestions"
```

---

### Task 9: Frontend plumbing: types, API functions, nav, middleware

**Files:**
- Create: `frontend/src/lib/invoicing.ts`
- Modify: `frontend/src/components/dashboard/sidebar.tsx:5-23`, `frontend/src/middleware.ts:3-9`

**Interfaces:**
- Produces TS types `Client`, `TimeEntry`, `UnbilledSummary`, `InvoiceSummary`, `Invoice`, `InvoiceLine`, `InvoicePreview`, `SuggestedEntry`, `PublicInvoice`, and helpers `fmtMoney(amount: string|number, currency: string)`, `fmtHours(h: string|number)`, `authHeaders(token)`.

- [ ] **Step 1: Types and helpers**

`frontend/src/lib/invoicing.ts`:

```ts
export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  billing_email: string | null;
  address: string | null;
  hourly_rate: string;
  currency: string;
  payment_terms_days: number;
  match_keywords: string | null;
  unbilled_hours: string;
  unbilled_amount: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  client_id: string;
  client_name: string;
  entry_date: string;
  hours: string;
  description: string;
  invoice_id: string | null;
  invoice_number: string | null;
  created_at: string;
}

export interface UnbilledSummary {
  client_id: string;
  client_name: string;
  currency: string;
  unbilled_hours: string;
  unbilled_amount: string;
}

export interface InvoiceLine {
  id: string;
  time_entry_id: string | null;
  line_date: string;
  description: string;
  hours: string;
  rate: string;
  amount: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface InvoiceSummary {
  id: string;
  client_id: string;
  client_name: string;
  number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  currency: string;
  subtotal: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Invoice extends InvoiceSummary {
  hourly_rate: string;
  client_contact_name: string | null;
  client_billing_email: string | null;
  client_address: string | null;
  notes: string | null;
  public_token: string;
  lines: InvoiceLine[];
}

export interface InvoicePreview {
  entry_count: number;
  total_hours: string;
  subtotal: string;
  currency: string;
}

export interface SuggestedEntry {
  external_id: string | null;
  title: string;
  entry_date: string;
  hours: string;
  starts_at: string;
  ends_at: string;
}

export interface PublicInvoice {
  number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  currency: string;
  hourly_rate: string;
  subtotal: string;
  client_name: string;
  client_contact_name: string | null;
  client_billing_email: string | null;
  client_address: string | null;
  notes: string | null;
  sender_name: string;
  sender_email: string;
  lines: InvoiceLine[];
}

export function fmtMoney(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function fmtHours(hours: string | number): string {
  const n = typeof hours === "string" ? parseFloat(hours) : hours;
  return `${n.toFixed(2)}h`;
}

export function authHeaders(token: string | null): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
```

- [ ] **Step 2: Sidebar and middleware**

In `frontend/src/components/dashboard/sidebar.tsx` add `Timer, Users, Receipt` to the lucide import and insert after the Bookings route:

```ts
  { label: "Time", icon: Timer, href: "/time" },
  { label: "Clients", icon: Users, href: "/clients" },
  { label: "Invoices", icon: Receipt, href: "/invoices" },
```

In `frontend/src/middleware.ts` add `"/invoice/(.*)",` to `isPublicRoute` after `"/book(.*)"`.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit` → clean.

```bash
git add frontend/src/lib/invoicing.ts frontend/src/components/dashboard/sidebar.tsx frontend/src/middleware.ts
git commit -m "Add invoicing types, nav links, and public invoice route"
```

---

### Task 10: Clients page

**Files:**
- Create: `frontend/src/app/(dashboard)/clients/page.tsx`

**Interfaces:** Consumes `Client`, `fmtMoney`, `fmtHours`, `authHeaders` (Task 9), `apiFetch`, shadcn Dialog/Input/Label/Textarea/Button/Card, `useToast`, `ClockLoader`.

- [ ] **Step 1: Page**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { Client, authHeaders, fmtHours, fmtMoney } from "@/lib/invoicing";

const EMPTY = {
  name: "", contact_name: "", billing_email: "", address: "",
  hourly_rate: "", currency: "USD", payment_terms_days: "30", match_keywords: "",
};

export default function ClientsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      setClients(await apiFetch<Client[]>("/api/clients", { headers: authHeaders(token) }));
    } catch (e: any) {
      toast({ title: "Failed to load clients", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => { load(); }, [load]);

  function startEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      name: c.name, contact_name: c.contact_name ?? "", billing_email: c.billing_email ?? "",
      address: c.address ?? "", hourly_rate: c.hourly_rate, currency: c.currency,
      payment_terms_days: String(c.payment_terms_days), match_keywords: c.match_keywords ?? "",
    });
    setOpen(true);
  }

  function reset() { setEditingId(null); setForm(EMPTY); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const body = {
        name: form.name,
        contact_name: form.contact_name || null,
        billing_email: form.billing_email || null,
        address: form.address || null,
        hourly_rate: form.hourly_rate,
        currency: form.currency.toUpperCase(),
        payment_terms_days: Number(form.payment_terms_days),
        match_keywords: form.match_keywords || null,
      };
      await apiFetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
        method: editingId ? "PATCH" : "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      toast({ title: editingId ? "Client updated" : "Client added" });
      setOpen(false);
      reset();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Client) {
    if (!confirm(`Delete ${c.name}? This also deletes their time entries and invoices.`)) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/clients/${c.id}`, { method: "DELETE", headers: authHeaders(token) });
      toast({ title: "Client deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><ClockLoader size="lg" label="Loading clients" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">Who you bill and at what rate.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New client</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <form onSubmit={save}>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit" : "New"} client</DialogTitle>
                <DialogDescription>Billing details appear on invoices.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label htmlFor="name">Company name</Label><Input id="name" required {...field("name")} /></div>
                <div className="space-y-2"><Label htmlFor="contact_name">Contact name</Label><Input id="contact_name" {...field("contact_name")} /></div>
                <div className="space-y-2"><Label htmlFor="billing_email">Billing email</Label><Input id="billing_email" type="email" {...field("billing_email")} /></div>
                <div className="space-y-2"><Label htmlFor="address">Address</Label><Textarea id="address" rows={3} {...field("address")} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2 col-span-1"><Label htmlFor="hourly_rate">Rate / hr</Label><Input id="hourly_rate" type="number" step="0.01" min="0" required {...field("hourly_rate")} /></div>
                  <div className="space-y-2"><Label htmlFor="currency">Currency</Label><Input id="currency" maxLength={3} {...field("currency")} /></div>
                  <div className="space-y-2"><Label htmlFor="payment_terms_days">Net days</Label><Input id="payment_terms_days" type="number" min="0" max="365" {...field("payment_terms_days")} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="match_keywords">Calendar keywords</Label>
                  <Input id="match_keywords" placeholder="acme, standup" {...field("match_keywords")} />
                  <p className="text-xs text-muted-foreground">Comma-separated. Calendar events whose title contains one of these can be imported as time entries.</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No clients yet. Add the company you bill to get started.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{c.name}</h3>
                    {c.contact_name && <p className="text-sm text-muted-foreground">{c.contact_name}</p>}
                    {c.billing_email && <p className="text-sm text-muted-foreground truncate">{c.billing_email}</p>}
                    <p className="text-sm mt-2">{fmtMoney(c.hourly_rate, c.currency)} / hr · Net {c.payment_terms_days}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unbilled: {fmtHours(c.unbilled_hours)} · {fmtMoney(c.unbilled_amount, c.currency)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`. Open `/clients` locally, add a client, edit it, confirm the card updates.

```bash
git add "frontend/src/app/(dashboard)/clients/page.tsx"
git commit -m "Add clients page"
```

---

### Task 11: Time page (daily log)

**Files:**
- Create: `frontend/src/app/(dashboard)/time/page.tsx`
- Create: `frontend/src/components/time/import-dialog.tsx`

**Interfaces:** Consumes `TimeEntry`, `Client`, `UnbilledSummary`, `SuggestedEntry`, helpers (Task 9); routes from Tasks 4 and 8.

- [ ] **Step 1: Import dialog component**

`frontend/src/components/time/import-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { CalendarSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { Client, SuggestedEntry, authHeaders } from "@/lib/invoicing";

interface Props {
  clients: Client[];
  defaultStart: string;
  defaultEnd: string;
  onImported: () => void;
}

type Row = SuggestedEntry & { checked: boolean; description: string };

export function ImportDialog({ clients, defaultStart, defaultEnd, onImported }: Props) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const token = await getToken();
      const found = await apiFetch<SuggestedEntry[]>("/api/time-entries/suggest", {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ client_id: clientId, start, end }),
      });
      setRows(found.map((s) => ({ ...s, checked: true, description: s.title })));
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function importChecked() {
    const picked = (rows ?? []).filter((r) => r.checked);
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const token = await getToken();
      await apiFetch("/api/time-entries/bulk", {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({
          entries: picked.map((r) => ({
            client_id: clientId, entry_date: r.entry_date, hours: r.hours, description: r.description,
          })),
        }),
      });
      toast({ title: `Imported ${picked.length} entr${picked.length === 1 ? "y" : "ies"}` });
      setOpen(false);
      setRows(null);
      onImported();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev!.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const client = clients.find((c) => c.id === clientId);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRows(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={clients.length === 0}>
          <CalendarSearch className="h-4 w-4 mr-2" />Import from calendar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from calendar</DialogTitle>
          <DialogDescription>
            Finds synced calendar events whose title matches the client&apos;s keywords.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-2"><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button onClick={search} disabled={busy || !clientId}>Search</Button>
        </div>
        {client && !client.match_keywords && (
          <p className="text-sm text-amber-600">This client has no calendar keywords. Add some on the Clients page first.</p>
        )}
        {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">No matching events that aren&apos;t already logged.</p>}
        {rows && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={`${r.external_id}-${r.starts_at}`} className="grid grid-cols-[auto_6rem_1fr_5rem] gap-2 items-center">
                <input type="checkbox" checked={r.checked} onChange={(e) => update(i, { checked: e.target.checked })} className="h-4 w-4" />
                <span className="text-sm">{format(new Date(r.entry_date + "T00:00:00"), "MMM d")}</span>
                <Input value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
                <Input type="number" step="0.25" min="0.25" value={r.hours} onChange={(e) => update(i, { hours: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={importChecked} disabled={busy || !rows || rows.every((r) => !r.checked)}>
            Import selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Time page**

`frontend/src/app/(dashboard)/time/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { addWeeks, eachDayOfInterval, endOfWeek, format, isToday, parseISO, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Pencil, Trash2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { ImportDialog } from "@/components/time/import-dialog";
import { apiFetch } from "@/lib/api";
import { Client, TimeEntry, UnbilledSummary, authHeaders, fmtHours, fmtMoney } from "@/lib/invoicing";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export default function TimePage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<UnbilledSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);

  const [form, setForm] = useState({ entry_date: iso(new Date()), client_id: "", hours: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ hours: "", description: "" });

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      const [c, e, s] = await Promise.all([
        apiFetch<Client[]>("/api/clients", { headers }),
        apiFetch<TimeEntry[]>(`/api/time-entries?start=${iso(weekStart)}&end=${iso(weekEnd)}`, { headers }),
        apiFetch<UnbilledSummary[]>("/api/time-entries/summary", { headers }),
      ]);
      setClients(c);
      setEntries(e);
      setSummary(s);
      setForm((f) => (f.client_id || c.length === 0 ? f : { ...f, client_id: c[0].id }));
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast, weekStart, weekEnd]);

  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const token = await getToken();
      await apiFetch("/api/time-entries", {
        method: "POST", headers: authHeaders(token), body: JSON.stringify(form),
      });
      setForm((f) => ({ ...f, hours: "", description: "" }));
      const d = parseISO(form.entry_date);
      if (d < weekStart || d > weekEnd) setWeekStart(startOfWeek(d, { weekStartsOn: 1 }));
      else load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id: string) {
    try {
      const token = await getToken();
      await apiFetch(`/api/time-entries/${id}`, {
        method: "PATCH", headers: authHeaders(token), body: JSON.stringify(edit),
      });
      setEditId(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function remove(entry: TimeEntry) {
    if (!confirm("Delete this entry?")) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/time-entries/${entry.id}`, { method: "DELETE", headers: authHeaders(token) });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const byDay = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    for (const e of entries) (m[e.entry_date] ??= []).push(e);
    return m;
  }, [entries]);
  const weekHours = entries.reduce((s, e) => s + parseFloat(e.hours), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><ClockLoader size="lg" label="Loading time" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time</h1>
          <p className="text-muted-foreground mt-2">Log your hours each day. Billed entries lock once invoiced.</p>
        </div>
        <ImportDialog clients={clients} defaultStart={iso(weekStart)} defaultEnd={iso(weekEnd)} onImported={load} />
      </div>

      {clients.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Add a client first, then log time against it.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-4">
              <form onSubmit={add} className="grid gap-3 sm:grid-cols-[9.5rem_12rem_6rem_1fr_auto] items-center">
                <Input type="date" required value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" step="0.25" min="0.25" max="24" required placeholder="Hours" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
                <Input required placeholder="What did you work on?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <Button type="submit" disabled={adding || !form.client_id}>Add</Button>
              </form>
            </CardContent>
          </Card>

          {summary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summary.map((s) => (
                <Badge key={s.client_id} variant="secondary" className="py-1.5 px-3 font-normal">
                  <span className="font-medium mr-1">{s.client_name}</span>
                  unbilled {fmtHours(s.unbilled_hours)} · {fmtMoney(s.unbilled_amount, s.currency)}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" aria-label="Previous week" onClick={() => setWeekStart(addWeeks(weekStart, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</Button>
              <Button size="icon" variant="ghost" aria-label="Next week" onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
              <span className="ml-2 font-medium">{format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}</span>
            </div>
            <span className="text-sm text-muted-foreground">{fmtHours(weekHours)} this week</span>
          </div>

          <div className="space-y-3">
            {days.map((day) => {
              const key = iso(day);
              const list = byDay[key] ?? [];
              const total = list.reduce((s, e) => s + parseFloat(e.hours), 0);
              return (
                <Card key={key} className={isToday(day) ? "ring-1 ring-primary/40" : ""}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">{format(day, "EEEE, MMM d")}</h3>
                      <span className="text-sm text-muted-foreground">{total > 0 ? fmtHours(total) : "—"}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground/70">No entries</p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {list.map((e) => (
                          <li key={e.id} className={`py-2 flex items-center gap-3 ${e.invoice_id ? "opacity-60" : ""}`}>
                            {editId === e.id ? (
                              <>
                                <Input className="w-24" type="number" step="0.25" min="0.25" max="24" value={edit.hours} onChange={(ev) => setEdit({ ...edit, hours: ev.target.value })} />
                                <Input className="flex-1" value={edit.description} onChange={(ev) => setEdit({ ...edit, description: ev.target.value })} />
                                <Button size="icon" variant="ghost" aria-label="Save" onClick={() => saveEdit(e.id)}><Check className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                              </>
                            ) : (
                              <>
                                <span className="w-16 text-sm font-medium tabular-nums">{fmtHours(e.hours)}</span>
                                <span className="flex-1 text-sm min-w-0">
                                  <span className="text-muted-foreground mr-2">{e.client_name}</span>{e.description}
                                </span>
                                {e.invoice_number ? (
                                  <Badge variant="outline">{e.invoice_number}</Badge>
                                ) : (
                                  <>
                                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditId(e.id); setEdit({ hours: e.hours, description: e.description }); }}><Pencil className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>
                                  </>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`. Open `/time`, add an entry for today, edit it, delete it, switch weeks.

```bash
git add "frontend/src/app/(dashboard)/time/page.tsx" frontend/src/components/time/import-dialog.tsx
git commit -m "Add daily time log page with calendar import"
```

---

### Task 12: Invoices list and new-invoice dialog

**Files:**
- Create: `frontend/src/app/(dashboard)/invoices/page.tsx`
- Create: `frontend/src/components/invoices/status-badge.tsx`

**Interfaces:** Consumes `InvoiceSummary`, `InvoicePreview`, `Client`, helpers; routes from Task 7. Produces `<StatusBadge status />`.

- [ ] **Step 1: Status badge**

`frontend/src/components/invoices/status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { InvoiceStatus, STATUS_LABEL } from "@/lib/invoicing";

const CLASSES: Record<InvoiceStatus, string> = {
  draft: "bg-slate-200 text-slate-800 hover:bg-slate-200",
  sent: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  paid: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  void: "bg-rose-100 text-rose-800 hover:bg-rose-100",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge className={CLASSES[status]}>{STATUS_LABEL[status]}</Badge>;
}
```

- [ ] **Step 2: List page**

`frontend/src/app/(dashboard)/invoices/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { StatusBadge } from "@/components/invoices/status-badge";
import { apiFetch } from "@/lib/api";
import { Client, Invoice, InvoicePreview, InvoiceSummary, authHeaders, fmtHours, fmtMoney } from "@/lib/invoicing";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const fmtD = (s: string) => format(new Date(s + "T00:00:00"), "MMM d, yyyy");

export default function InvoicesPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const lastMonth = subMonths(new Date(), 1);
  const [form, setForm] = useState({ client_id: "", period_start: iso(startOfMonth(lastMonth)), period_end: iso(endOfMonth(lastMonth)) });
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      const [i, c] = await Promise.all([
        apiFetch<InvoiceSummary[]>("/api/invoices", { headers }),
        apiFetch<Client[]>("/api/clients", { headers }),
      ]);
      setInvoices(i);
      setClients(c);
      setForm((f) => (f.client_id || c.length === 0 ? f : { ...f, client_id: c[0].id }));
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open || !form.client_id || !form.period_start || !form.period_end) { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const p = await apiFetch<InvoicePreview>(
          `/api/invoices/preview?client_id=${form.client_id}&period_start=${form.period_start}&period_end=${form.period_end}`,
          { headers: authHeaders(token) },
        );
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, form, getToken]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const token = await getToken();
      const inv = await apiFetch<Invoice>("/api/invoices", {
        method: "POST", headers: authHeaders(token), body: JSON.stringify(form),
      });
      toast({ title: `Created ${inv.number}` });
      setOpen(false);
      router.push(`/invoices/${inv.id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><ClockLoader size="lg" label="Loading invoices" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-2">Bill unbilled time for a period.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={clients.length === 0}><Plus className="h-4 w-4 mr-2" />New invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>New invoice</DialogTitle>
                <DialogDescription>Pulls every unbilled entry for the client in this period.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>From</Label><Input type="date" required value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                  <div className="space-y-2"><Label>To</Label><Input type="date" required value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  {preview ? (
                    preview.entry_count === 0 ? (
                      <span className="text-muted-foreground">No unbilled entries in this period.</span>
                    ) : (
                      <span>
                        <strong>{preview.entry_count}</strong> entr{preview.entry_count === 1 ? "y" : "ies"} · {fmtHours(preview.total_hours)} ·{" "}
                        <strong>{fmtMoney(preview.subtotal, preview.currency)}</strong>
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">Select a client and period.</span>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating || !preview || preview.entry_count === 0}>Create draft</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No invoices yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <Card key={inv.id} className="cursor-pointer hover:bg-muted/30 transition" onClick={() => router.push(`/invoices/${inv.id}`)}>
              <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="font-mono font-semibold w-24">{inv.number}</span>
                <span className="flex-1 min-w-[10rem]">{inv.client_name}</span>
                <span className="text-sm text-muted-foreground">{fmtD(inv.period_start)} – {fmtD(inv.period_end)}</span>
                <span className="font-medium tabular-nums w-28 text-right">{fmtMoney(inv.subtotal, inv.currency)}</span>
                <StatusBadge status={inv.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`. Open `/invoices`, create a draft from logged entries, confirm redirect to detail (404 until Task 13, that is expected).

```bash
git add "frontend/src/app/(dashboard)/invoices/page.tsx" frontend/src/components/invoices/status-badge.tsx
git commit -m "Add invoices list and new invoice dialog"
```

---

### Task 13: Invoice detail page and shared invoice view

**Files:**
- Create: `frontend/src/components/invoices/invoice-view.tsx`
- Create: `frontend/src/app/(dashboard)/invoices/[id]/page.tsx`

**Interfaces:** Produces `<InvoiceView invoice={PublicInvoice-shaped} />` reused by the public page. Consumes `Invoice`, `API_BASE`, `StatusBadge`.

- [ ] **Step 1: Shared view**

`frontend/src/components/invoices/invoice-view.tsx`:

```tsx
import { format } from "date-fns";
import { InvoiceLine, fmtMoney } from "@/lib/invoicing";

export interface InvoiceViewData {
  number: string;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  currency: string;
  hourly_rate: string;
  subtotal: string;
  client_name: string;
  client_contact_name: string | null;
  client_billing_email: string | null;
  client_address: string | null;
  notes: string | null;
  sender_name: string;
  sender_email: string;
  lines: InvoiceLine[];
}

const fmtD = (s: string) => format(new Date(s + "T00:00:00"), "MMM d, yyyy");

export function InvoiceView({ invoice }: { invoice: InvoiceViewData }) {
  const totalHours = invoice.lines.reduce((s, l) => s + parseFloat(l.hours), 0);
  return (
    <div className="rounded-2xl border bg-background p-6 sm:p-10 space-y-8">
      <div className="flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-lg font-semibold">{invoice.sender_name}</p>
          <p className="text-sm text-muted-foreground">{invoice.sender_email}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight">INVOICE</p>
          <p className="font-mono">{invoice.number}</p>
          <p className="text-sm text-muted-foreground">Issued {fmtD(invoice.issue_date)}</p>
          <p className="text-sm text-muted-foreground">Due {fmtD(invoice.due_date)}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">BILL TO</p>
          <p className="font-medium">{invoice.client_name}</p>
          {invoice.client_contact_name && <p>{invoice.client_contact_name}</p>}
          {invoice.client_address && <p className="whitespace-pre-line">{invoice.client_address}</p>}
          {invoice.client_billing_email && <p className="text-muted-foreground">{invoice.client_billing_email}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">PERIOD</p>
          <p>{fmtD(invoice.period_start)} to {fmtD(invoice.period_end)}</p>
          <p className="text-xs font-semibold text-muted-foreground mt-3 mb-1">RATE</p>
          <p>{fmtMoney(invoice.hourly_rate, invoice.currency)} / hour</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Description</th>
              <th className="py-2 pr-3 font-semibold text-right">Hours</th>
              <th className="py-2 pr-3 font-semibold text-right">Rate</th>
              <th className="py-2 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-border/60">
                <td className="py-2 pr-3 whitespace-nowrap">{fmtD(l.line_date)}</td>
                <td className="py-2 pr-3">{l.description}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{parseFloat(l.hours).toFixed(2)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{parseFloat(l.rate).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">{parseFloat(l.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-3" />
              <td className="py-3 pr-3">Total</td>
              <td className="py-3 pr-3 text-right tabular-nums">{totalHours.toFixed(2)}</td>
              <td />
              <td className="py-3 text-right tabular-nums">{fmtMoney(invoice.subtotal, invoice.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {invoice.notes && (
        <div className="text-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-1">NOTES</p>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Detail page**

`frontend/src/app/(dashboard)/invoices/[id]/page.tsx`:

```tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Send, CheckCircle2, Ban, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { StatusBadge } from "@/components/invoices/status-badge";
import { InvoiceView } from "@/components/invoices/invoice-view";
import { apiFetch } from "@/lib/api";
import { API_BASE, Invoice, authHeaders } from "@/lib/invoicing";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ issue_date: "", due_date: "", notes: "" });

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const inv = await apiFetch<Invoice>(`/api/invoices/${id}`, { headers: authHeaders(token) });
      setInvoice(inv);
      setDraft({ issue_date: inv.issue_date, due_date: inv.due_date, notes: inv.notes ?? "" });
    } catch (e: any) {
      toast({ title: "Failed to load invoice", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, id, toast]);

  useEffect(() => { load(); }, [load]);

  async function action(path: string, method: string, body?: unknown, successMsg?: string) {
    setBusy(true);
    try {
      const token = await getToken();
      await apiFetch(path, { method, headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
      if (successMsg) toast({ title: successMsg });
      await load();
      return true;
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!invoice) return;
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/invoices/${invoice.id}/pdf`, { headers: authHeaders(token) });
    if (!res.ok) { toast({ title: "Download failed", variant: "destructive" }); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `${invoice.number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  async function send() {
    if (!invoice) return;
    if (!confirm(`Email ${invoice.number} to ${invoice.client_billing_email}?`)) return;
    await action(`/api/invoices/${invoice.id}/send`, "POST", undefined, "Invoice sent");
  }

  async function remove() {
    if (!invoice || !confirm(`Delete draft ${invoice.number}? Its entries become unbilled again.`)) return;
    if (await action(`/api/invoices/${invoice.id}`, "DELETE", undefined, "Draft deleted")) router.push("/invoices");
  }

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><ClockLoader size="lg" label="Loading invoice" /></div>;
  }
  if (!invoice) return <p className="text-muted-foreground">Invoice not found.</p>;

  const isDraft = invoice.status === "draft";
  const publicUrl = `/invoice/${invoice.public_token}`;

  return (
    <div className="space-y-6">
      <Link href="/invoices" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" />Invoices
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight font-mono">{invoice.number}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status !== "void" && (
            <Button variant="outline" onClick={downloadPdf}><Download className="h-4 w-4 mr-2" />PDF</Button>
          )}
          {invoice.status !== "void" && (
            <Button variant="outline" asChild><a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Public link</a></Button>
          )}
          {(isDraft || invoice.status === "sent") && (
            <Button onClick={send} disabled={busy || !invoice.client_billing_email}>
              <Send className="h-4 w-4 mr-2" />{isDraft ? "Send" : "Resend"}
            </Button>
          )}
          {invoice.status === "sent" && (
            <Button variant="outline" disabled={busy} onClick={() => action(`/api/invoices/${invoice.id}/mark-paid`, "POST", undefined, "Marked paid")}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Mark paid
            </Button>
          )}
          {(isDraft || invoice.status === "sent") && (
            <Button variant="outline" disabled={busy} onClick={() => { if (confirm("Void this invoice? Its entries become unbilled again.")) action(`/api/invoices/${invoice.id}/void`, "POST", undefined, "Invoice voided"); }}>
              <Ban className="h-4 w-4 mr-2" />Void
            </Button>
          )}
          {isDraft && (
            <Button variant="destructive" disabled={busy} onClick={remove}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
          )}
        </div>
      </div>

      {isDraft && !invoice.client_billing_email && (
        <p className="text-sm text-amber-600">This invoice has no billing email, so it can&apos;t be sent. Add one to the client, then void and recreate.</p>
      )}

      {isDraft && (
        <form
          onSubmit={(e) => { e.preventDefault(); action(`/api/invoices/${invoice.id}`, "PATCH", { ...draft, notes: draft.notes || null }, "Saved"); }}
          className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] items-end rounded-xl border p-4"
        >
          <div className="space-y-2"><Label>Issue date</Label><Input type="date" value={draft.issue_date} onChange={(e) => setDraft({ ...draft, issue_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Due date</Label><Input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={1} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
          <Button type="submit" variant="outline" disabled={busy}>Save</Button>
        </form>
      )}

      <InvoiceView
        invoice={{
          ...invoice,
          sender_name: user?.fullName || user?.primaryEmailAddress?.emailAddress || "",
          sender_email: user?.primaryEmailAddress?.emailAddress || "",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`. Open a draft, edit notes, download the PDF, send it to a test billing email, mark paid.

```bash
git add frontend/src/components/invoices/invoice-view.tsx "frontend/src/app/(dashboard)/invoices/[id]/page.tsx"
git commit -m "Add invoice detail page with send, paid, void, and PDF actions"
```

---

### Task 14: Public invoice page

**Files:**
- Create: `frontend/src/app/invoice/[token]/page.tsx`

**Interfaces:** Consumes `PublicInvoice`, `InvoiceView`, `API_BASE`.

- [ ] **Step 1: Page**

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { InvoiceView } from "@/components/invoices/invoice-view";
import { LogoIcon } from "@/components/logo";
import { apiFetch } from "@/lib/api";
import { API_BASE, PublicInvoice } from "@/lib/invoicing";

export default function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    apiFetch<PublicInvoice>(`/api/public/invoices/${token}`)
      .then((inv) => { setInvoice(inv); setState("ok"); })
      .catch(() => setState("missing"));
  }, [token]);

  return (
    <div className="relative min-h-screen">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><LogoIcon /><span className="font-semibold">TimeIQ</span></div>
          {state === "ok" && (
            <Button asChild>
              <a href={`${API_BASE}/api/public/invoices/${token}/pdf`} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />Download PDF
              </a>
            </Button>
          )}
        </div>
        {state === "loading" && <div className="flex justify-center py-20"><ClockLoader size="lg" label="Loading invoice" /></div>}
        {state === "missing" && (
          <div className="rounded-2xl border bg-background p-10 text-center text-muted-foreground">
            This invoice is unavailable. It may have been voided or the link is incorrect.
          </div>
        )}
        {state === "ok" && invoice && <InvoiceView invoice={invoice} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`. Open the public link from a sent invoice in an incognito window; confirm it renders without sign-in and the PDF downloads. Confirm `/invoices` still requires sign-in.

```bash
git add "frontend/src/app/invoice/[token]/page.tsx"
git commit -m "Add public hosted invoice page"
```

---

### Task 15: Ship

- [ ] **Step 1: Full checks**

Run: `cd backend && .venv/bin/pytest -q` → all pass.
Run: `cd frontend && npx tsc --noEmit && npm run build` → clean.

- [ ] **Step 2: Apply migration to production database**

Run: `cd backend && .venv/bin/alembic upgrade head` (uses `DATABASE_URL` from `.env.local`, which points at Neon).

- [ ] **Step 3: Push**

```bash
git push origin main
```

Confirm the Vercel deploy succeeds for both projects, then smoke test `/time`, `/clients`, `/invoices` on production.
