# TimeIQ

Booking pages, weekly timesheets and invoices for freelancers, in one app.

- **Booking pages** that check every calendar you use. Add Google Calendar or any ICS / webcal link (Outlook, iCloud, work calendars) and clients only see the times you are actually free. Buffers, daily booking caps, intake questions, and reschedule / cancel links in every confirmation.
- **Weekly timesheets** with a grid per client, saved rows and suggestions pulled from your calendar.
- **Invoices** generated from logged hours, with expenses, PDF output, email delivery, overdue reminders and monthly auto-drafts.

**Hosted:** [timeiq.app](https://timeiq.app). We run it, keep it updated, back it up and handle email delivery and calendar syncing. The first 100 founders pay $19 a year, locked in for life.

**Self-hosted:** everything in this repository, free under the AGPL-3.0.

## Stack

| Part | Tech |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui (`frontend/`) |
| Backend | FastAPI, SQLAlchemy (async), Alembic (`backend/`) |
| Database | PostgreSQL |
| Auth | Clerk |
| Email | Resend |
| Payments | Stripe (optional) |
| Deploy | Vercel (two projects: `frontend/` and `backend/`), or any Node and Python host |

## Self-hosting

Requirements: Node 24, Python 3.11+, PostgreSQL 14+, a [Clerk](https://clerk.com) application and a [Resend](https://resend.com) API key.

### Backend

```sh
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp /dev/null .env.local   # then fill in the variables below
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

`backend/.env.local`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/db` |
| `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | Auth and the `user.*` webhook (`/api/webhooks/clerk`) |
| `RESEND_API_KEY` | Booking, invoice and notification email |
| `FRONTEND_URL`, `BACKEND_URL` | Public URLs, used in links and OAuth redirects |
| `CRON_SECRET` | Required for the cron endpoints in `backend/vercel.json` (calendar sync hourly, overdue digest weekly, monthly drafts). Cron calls are refused while it is empty. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional: Google Calendar OAuth. ICS links work without it. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDER`, `STRIPE_PRICE_STANDARD` | Optional. Leave unset and billing is off: every account has full access. |

Tests: `python -m pytest -q` from `backend/`. Tests that need a database only run against a local `timeiq_qa*` database.

### Frontend

```sh
cd frontend
npm install
cp .env.local.example .env.local   # add your Clerk keys and NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

## Contributing

Issues and pull requests are welcome. Please run the backend tests, `npx tsc --noEmit` and `npm run lint` before opening a PR.

## License

[GNU Affero General Public License v3.0](LICENSE). You can use, modify and self-host TimeIQ freely. If you run a modified version as a network service, the AGPL requires you to share your changes under the same license.
