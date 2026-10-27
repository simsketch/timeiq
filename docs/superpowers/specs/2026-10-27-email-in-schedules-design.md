# Email a schedule in

## Why

On a Skylight family calendar you can email it a soccer, band or school
schedule and the events appear on the calendar. Elon wants the same in TimeIQ:
forward the schedule, done. It fits the calendar angle TimeIQ is advertising
("all your calendars, one booking link"): schedules that arrive by email are
one more calendar, and they should stop people booking over practice.

## What it does

1. Each account has a private inbound address (see *Address* below). Settings
   and the Calendars page show it with a copy button.
2. Forward or send anything with a schedule to it: pasted text, a PDF, a
   screenshot or photo, a .ics attachment, or a mix.
3. TimeIQ reads every event out of it: title, date, start and end (or all day),
   location, and the time zone if stated (otherwise the account's zone). A
   season schedule becomes one event per occurrence.
4. The events go into a calendar named **From email** (created on first use),
   so they block those times on the booking page like any other calendar.
5. TimeIQ replies to the sender within about a minute: "Added 14 events from
   *Spring soccer schedule*", the list of events, an **Undo** link that removes
   exactly that import, and a link to the Calendars page.
6. If nothing could be read, the reply says so and suggests what to send.

## Goals

- Works with what people actually receive: PDFs from leagues, screenshots of
  team apps, pasted email text, .ics files.
- One forward, no review step. Undo is the safety net.
- Imported events behave like synced events everywhere availability is used.

## Non-goals (for now)

- Editing individual imported events in TimeIQ (undo and re-send instead).
- Updates to a schedule replacing the old import automatically (a second
  forward adds a second import; the reply notes overlaps with an earlier one).
- Two-way sync back to Google or Outlook.

## Anti-goals

- Anyone who learns the address can fill the calendar with junk: the address
  must be unguessable, and imports are capped.
- Silent failure: every email gets a reply, success or not.
- Events landing in the wrong time zone without saying which zone was assumed.

## How it works (decided)

- **Receiving:** Resend inbound. Resend posts an `email.received` webhook to
  `POST /api/webhooks/inbound-email`; the backend verifies the signature, finds
  the account by the address token, then fetches the body and attachments from
  Resend's API.
- **Reading schedules:** .ics attachments are parsed directly (no AI). Everything
  else goes to Claude (Haiku 5.5, `claude-haiku-5-5`) with the text, PDFs and
  images, asking for structured JSON events. Expected cost is about a cent
  per email.
- **Storage:** a calendar source of type `email`; events in the existing cached
  events table, tagged with the import they came from. A new `email_imports`
  table records sender, subject, received time, status, event count and an undo
  token. The hourly sync skips `email` sources.
- **Limits:** 20 imports per account per day, 15 MB per email, 300 events per
  import. Past a limit, the reply explains.
- **Address token:** random, 16+ characters, regenerable from Settings (which
  turns the old address off).

## Address

Two options, depending on how Resend is set up for timeiq.app:

- `schedule-<token>@timeiq.app` if Resend receiving is already on for the root
  domain (its MX record already points at Resend's inbound servers), or
- `<token>@in.timeiq.app`, which needs one MX record added at the registrar.

## Open questions for Elon

1. **Where should imported events show up?** Today they would block booking
   times inside TimeIQ only. TimeIQ also has a calendar feed you can subscribe
   to from Google, Apple or Skylight; it currently contains bookings only. Adding
   imported events to that feed would make them appear on your phone and
   Skylight too.
2. **Keys and setup** (see the chat message for exact steps): an Anthropic API
   key; in Resend, receiving turned on, a webhook pointing at TimeIQ, and an API
   key allowed to read received emails.

## Left to the builder

Prompt wording, exact JSON schema, reply email design (match the existing
transactional emails), how overlaps with earlier imports are detected and
worded, and the Settings/Calendars UI placement.
