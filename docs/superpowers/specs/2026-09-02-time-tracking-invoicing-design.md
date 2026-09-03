# Time Tracking and Invoicing — Design

Date: 2026-09-02

## Goal

Let a TimeIQ user log hours against a client each day, then generate, send, and track invoices built from those logged hours. Single-user usage today (one company being billed), but modeled so multiple clients work without rework.

## Decisions

- Time source: manual daily entries are the source of truth. A calendar import helper (phase 3) pre-fills entries from cached calendar events; the user confirms which to keep.
- No start/stop timer.
- Delivery: PDF attached to an email sent via Resend, plus a hosted public invoice page reachable by token. Payment is collected outside the app; the user marks invoices paid manually.
- Clients each have one hourly rate. No project layer.
- Invoice line items: one line per time entry.
- PDF generation: ReportLab in the FastAPI backend (pure Python, runs on Vercel serverless). The hosted page is a separate React view of the same data.

## Phases

1. Clients and manual time entries.
2. Invoices: draft from unbilled entries, PDF, email, hosted page, status transitions.
3. Calendar import: suggest entries from cached events matching a client's keywords.

## Data model

All tables live in the `timeiq` schema and are owned by a user (`user_id` FK to `timeiq.users.id`, cascade delete), matching existing models.

### clients

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | index |
| name | varchar(255) | required |
| contact_name | varchar(255) | nullable |
| billing_email | varchar(320) | nullable; required to send an invoice |
| address | text | nullable, free text, rendered as-is |
| hourly_rate | numeric(10,2) | required |
| currency | varchar(3) | default USD |
| payment_terms_days | integer | default 30 |
| match_keywords | text | nullable, comma-separated, used by calendar import |
| created_at, updated_at | timestamptz | |

### time_entries

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | index |
| client_id | uuid fk clients | cascade delete, index |
| entry_date | date | required |
| hours | numeric(6,2) | required, > 0 |
| description | text | required |
| invoice_id | uuid fk invoices | nullable, ON DELETE SET NULL, index |
| created_at, updated_at | timestamptz | |

An entry with a non-null `invoice_id` is billed. Billed entries reject update and delete (409). Voiding the invoice sets `invoice_id` back to null.

### invoices

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk | index |
| client_id | uuid fk clients | cascade delete, index |
| number | varchar(20) | per user, formatted `INV-0001`; unique on (user_id, number) |
| status | varchar(10) | draft, sent, paid, void |
| issue_date | date | defaults to creation date |
| due_date | date | issue_date + client.payment_terms_days |
| period_start, period_end | date | inclusive |
| currency | varchar(3) | snapshot from client |
| hourly_rate | numeric(10,2) | snapshot from client |
| subtotal | numeric(12,2) | sum of line amounts |
| client_name, client_contact_name, client_billing_email, client_address | snapshot | copied at creation |
| notes | text | nullable, shown on PDF and hosted page |
| public_token | varchar(64) | unique, `secrets.token_urlsafe(32)` |
| sent_at, paid_at | timestamptz | nullable |
| created_at, updated_at | timestamptz | |

### invoice_lines

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| invoice_id | uuid fk invoices | cascade delete, index |
| time_entry_id | uuid | nullable, no FK (entry may be deleted after void) |
| line_date | date | |
| description | text | |
| hours | numeric(6,2) | |
| rate | numeric(10,2) | |
| amount | numeric(12,2) | hours * rate, rounded half up to cents |

### users

Add `next_invoice_number integer not null default 1`. Incremented when a draft is created.

## API

All authenticated routes use the existing `get_current_user` dependency and scope queries by `user.id`. Pydantic schemas live in `app/schemas/`, models in `app/models/`, routers in `app/routers/`, mirroring current layout.

### Clients — `app/routers/clients.py`

- `GET /api/clients` — list, ordered by name. Each item includes `unbilled_hours` and `unbilled_amount` computed by a grouped subquery over unbilled entries.
- `POST /api/clients` — create.
- `PATCH /api/clients/{id}` — partial update.
- `DELETE /api/clients/{id}` — 204. Cascades entries and invoices.

### Time entries — `app/routers/time_entries.py`

- `GET /api/time-entries?client_id=&start=&end=` — list, ordered by entry_date desc then created_at desc. Includes `client_name`, `invoice_id`, and `invoice_number` when billed.
- `POST /api/time-entries` — create. Validates hours > 0 and client belongs to user.
- `PATCH /api/time-entries/{id}` — 409 if billed.
- `DELETE /api/time-entries/{id}` — 409 if billed.
- `GET /api/time-entries/summary` — per client: `client_id`, `client_name`, `unbilled_hours`, `unbilled_amount`, `currency`.
- `POST /api/time-entries/suggest` (phase 3) — body `{client_id, start, end}`. Returns cached events in range whose title contains any of the client's keywords (case-insensitive, trimmed), excluding all-day events. Each suggestion: `external_id`, `title`, `entry_date`, `hours` (duration rounded to nearest 0.25, minimum 0.25), `starts_at`, `ends_at`. Excludes events whose date and title already exist as an entry for that client. Creation goes through the normal `POST /api/time-entries` (frontend sends one request per ticked suggestion, or a `POST /api/time-entries/bulk` accepting a list; bulk is preferred and included).

### Invoices — `app/routers/invoices.py`

- `POST /api/invoices` — body `{client_id, period_start, period_end, notes?}`. Selects unbilled entries for that client with `entry_date` in range. 400 if none. Snapshots client fields and rate, creates lines, computes subtotal, assigns `INV-{n:04d}` from `user.next_invoice_number` then increments it, generates `public_token`, stamps entries with `invoice_id`. Returns the invoice with lines.
- `GET /api/invoices/preview?client_id=&period_start=&period_end=` — returns `{entry_count, total_hours, subtotal, currency}` for the dialog before creating.
- `GET /api/invoices` — list with `client_name`, ordered by created_at desc.
- `GET /api/invoices/{id}` — detail with lines.
- `PATCH /api/invoices/{id}` — draft only (409 otherwise): `issue_date`, `due_date`, `notes`.
- `POST /api/invoices/{id}/send` — draft or sent (allows resend). 400 if snapshot billing email is empty. Generates PDF, emails via Resend, sets status sent and `sent_at`.
- `POST /api/invoices/{id}/mark-paid` — sent only. Sets paid and `paid_at`.
- `POST /api/invoices/{id}/void` — draft or sent. Sets void, releases entries (`invoice_id = null`).
- `DELETE /api/invoices/{id}` — draft only. Releases entries, deletes invoice.
- `GET /api/invoices/{id}/pdf` — `application/pdf`, filename `{number}.pdf`.

### Public — added to `app/routers/public.py`

- `GET /api/public/invoices/{token}` — invoice with lines and sender info (user name, email). 404 for void invoices.
- `GET /api/public/invoices/{token}/pdf` — same PDF bytes.

## Services

### `app/services/invoice_pdf.py`

`build_invoice_pdf(invoice, lines, sender_name, sender_email) -> bytes` using ReportLab `SimpleDocTemplate` with platypus tables. Layout, top to bottom: sender name and email; "INVOICE" with number, issue date, due date, period; bill-to block from snapshot fields; line table (Date, Description, Hours, Rate, Amount) with alternating row shading; totals row; payment terms line ("Due within N days" derived from issue and due dates); notes. Amounts formatted with currency code and two decimals.

Add `reportlab>=4.0` to `backend/requirements.txt`.

### `app/services/email.py`

Add `send_invoice(invoice, lines, pdf_bytes, sender: User, hosted_url: str)`. Subject `Invoice {number} from {sender name}`. Body: greeting to contact name or client name, amount due, due date, link to hosted page. Attachment: `{number}.pdf`, base64 via the same Resend attachment shape used for ICS. Reply-to set to the sender's email.

Hosted URL: `{settings.FRONTEND_URL}/invoice/{public_token}`.

## Frontend

New sidebar entries: Time (`/time`), Clients (`/clients`), Invoices (`/invoices`). Public route `/invoice/[token]`. All API calls go through typed functions in `frontend/src/lib/api.ts` following existing style.

### `/time`

- Quick-add row at top: date (default today), client select, hours (step 0.25), description, Add. Submitting clears description and hours and keeps date and client.
- Unbilled summary strip: one chip per client showing hours and amount.
- Week view: entries grouped by day for the selected week, Monday to Sunday, with prev/next/today controls. Each day shows its total hours. Each entry supports inline edit and delete. Billed entries are dimmed, show an invoice number badge, and hide edit/delete.
- Phase 3: an "Import from calendar" button opens a dialog with client and date range, lists suggestions with checkboxes and editable hours and description, and creates the ticked ones in bulk.

### `/clients`

Card list. Dialog form with all client fields. Each card shows rate, unbilled hours and amount, and edit/delete actions. Delete confirms since it cascades entries and invoices.

### `/invoices` and `/invoices/[id]`

- List: number, client, period, total, status badge, issue date. Click opens detail.
- New invoice dialog: client select, period start and end (default previous calendar month), live preview from the preview endpoint, Create button disabled when zero entries.
- Detail: header with number, status, client block, dates; editable notes and due date while draft; line table; totals. Actions by status: draft → Download PDF, Send (confirm dialog), Delete; sent → Download PDF, Resend, Mark paid, Void; paid → Download PDF; void → none.

### `/invoice/[token]`

Unauthenticated. Renders the same content as the PDF in page form with a Download PDF button hitting the public PDF endpoint. 404 view when the token is unknown or the invoice is void. Mirrors the public booking page pattern for layout and auth exclusion.

## Error handling

- Client must belong to the caller for every entry and invoice operation, otherwise 404.
- Hours must be > 0, otherwise 422 from Pydantic validation.
- Billed entry update/delete: 409 `"Entry is on invoice INV-0001"`.
- Draft creation with no unbilled entries in range: 400.
- Send with empty billing email: 400.
- Status transitions outside the allowed set: 409 with current status in the message.
- Email failures during send propagate as 502 and do not change status.

## Testing

The repo has no test suite. Add `backend/tests/` with pytest and pytest-asyncio, using a plain in-memory approach for pure logic (no database):

- Invoice math: line amount rounding, subtotal.
- Invoice number formatting and sequencing helper.
- Keyword matching and duration-to-hours rounding for calendar suggestions.
- `build_invoice_pdf` returns bytes starting with `%PDF`.

Routes and UI are verified manually against the local app. Migration `006_add_time_tracking_and_invoices.py` is applied manually via `alembic upgrade head` per project convention.

## Out of scope

Timer, projects, taxes, expenses, multi-currency conversion, online payment, recurring invoices, PDF branding customization.
