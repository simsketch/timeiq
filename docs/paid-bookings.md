# Paid bookings

Hosts connect an Express account in Settings → Get paid for bookings. They choose their business country (US by default), complete Stripe onboarding, then set a price on an event type. Charges and payouts must both be enabled before setting a price. TimeIQ creates direct charges on the host's account and takes no application fee. Stripe fees apply.

## Owner setup

1. Enable Stripe Connect on the platform's Stripe account. Configure Express accounts and Stripe-hosted onboarding, including the platform's branding, business details, and supported host countries. Enable card payments and transfers for connected accounts. See [Express accounts](https://docs.stripe.com/connect/express-accounts) and [direct charges](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted).
2. In Stripe Workbench → Webhooks, add `https://<backend>/api/webhooks/stripe-connect`. Set **Events from** to **Connected accounts**, and subscribe to `account.updated`, `checkout.session.completed`, and `checkout.session.expired`. Use snapshot events. See [Connect webhooks](https://docs.stripe.com/connect/webhooks).
3. Set backend `STRIPE_CONNECT_WEBHOOK_SECRET` to that endpoint's signing secret. Use the existing platform `STRIPE_SECRET_KEY`; configure each environment with matching Stripe mode and endpoint secrets. Keep the subscription webhook and `STRIPE_WEBHOOK_SECRET` as they are.
4. Set the existing `FRONTEND_URL` and `BACKEND_URL` to the deployed URLs, and configure `CRON_SECRET`. The added Vercel cron calls `/api/cron/expire-booking-payments` every ten minutes. Other deployments should call it with `Authorization: Bearer <CRON_SECRET>` on the same schedule. Slot requests and new booking attempts also reconcile expired holds.
5. After merging migration `025_booking_extras`, have the deployment owner apply `026_paid_bookings` with down revision `025_booking_extras`. This lane did not run Alembic against any database.
6. In a Stripe sandbox, complete host onboarding, book and pay for an event, check webhook delivery and both confirmation invites, then check host and guest refunds before enabling live bookings.

## Behavior

- A null price means free. Prices use integer cents; supported currencies are USD, EUR, GBP, CAD, AUD, NZD, CHF, SGD, and HKD. Checkout uses card payments to avoid delayed payment methods taking a slot after its hold has ended.
- Checkout expires after about 31 minutes. Pending payment holds block availability and daily caps across event types. Before releasing a due hold, TimeIQ checks and closes its Checkout Session. A payment that completes during that check confirms the held booking. Stripe outages keep the hold busy until the next successful check.
- Only a verified, matching Connect event or an expiry reconciliation can confirm a payment. Webhook retries do not duplicate confirmations. A late payment for a released hold is refunded.
- Host cancellations request a full refund. Guest cancellations more than 24 hours before the current start request a full refund; at exactly 24 hours or less, the payment stays with the host. Failed refund API calls leave the booking active so cancellation can be retried. Stripe may initially mark a refund pending while it processes it; the host can inspect its final state in Stripe.
- Rescheduling carries the original price, currency, payment intent, and connected account to the new booking without another charge. The old paid booking has status `rescheduled`; replayed events for it do not refund the active booking.
- If charges become disabled, the host's paid event types disappear from their public profile, and direct booking links explain that payments are unavailable. Existing paid bookings can still be rescheduled or cancelled.
- Free bookings follow the existing confirmation flow. Public booking and reschedule requests are limited to ten per email per hour across hosts. Public cancellations have a separate limit of ten per email per hour; cancellation tokens and row locks also prevent repeated cancellation emails.

## Validation

`backend/tests/test_paid_bookings.py` mocks Stripe and email and exercises real Postgres locks when `DATABASE_URL` points to a local `timeiq_qa*` database. No production credentials are needed. The full suite, TypeScript, lint, and production build are required before merging.
