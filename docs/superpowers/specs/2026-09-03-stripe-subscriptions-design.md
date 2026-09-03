# Paid Subscriptions via Stripe — Design

Date: 2026-09-03

## Goal

Turn TimeIQ into a paid app with a founding-member price of $5/year for the first 100 paying subscribers and a standard price afterwards, then run a small Facebook ad test to look for paying subscribers.

## Decisions

- Billing provider: Stripe Checkout (hosted) for purchase, Stripe Customer Portal for management, Stripe webhooks for lifecycle.
- Prices: `founder` $5/year while founder seats taken < `FOUNDER_SEATS` (default 100); `standard` $29/year after. Both are Stripe Prices referenced by id in env. No free trial: pay up front. This is the cleanest conversion signal for the ad test.
- Gating: dashboard pages and their API routes require an entitled subscription. Public booking pages, public invoice pages, ICS feeds, webhooks, and `/api/me*` stay open.
- Safe default: if `STRIPE_SECRET_KEY` is empty, billing is disabled and everything behaves as before. This prevents lockout before keys are configured.
- Grandfathering: migration sets every existing user to `complimentary`, which is entitled forever and never counts toward founder seats.
- Success confirmation: after Checkout the success page calls `/api/billing/confirm` with the session id so entitlement is applied immediately, without waiting for the webhook.

## Data model

`timeiq.users` gains:

| column | type | notes |
|---|---|---|
| stripe_customer_id | varchar(255) unique nullable | |
| stripe_subscription_id | varchar(255) unique nullable | |
| subscription_status | varchar(30) not null default 'none' | Stripe status verbatim (`active`, `trialing`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`) or `none` or `complimentary` |
| subscription_plan | varchar(20) nullable | `founder` or `standard` |
| subscription_current_period_end | timestamptz nullable | |

Entitled statuses: `active`, `trialing`, `past_due`, `complimentary`.

## Config (backend)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDER`, `STRIPE_PRICE_STANDARD`, `FOUNDER_SEATS` (default 100). Frontend: `NEXT_PUBLIC_META_PIXEL_ID` optional.

## Backend

### `app/services/billing.py`

- `enabled() -> bool`
- `is_entitled(user) -> bool`
- `plan_for_price(price_id) -> str`
- `founder_seats_taken(db) -> int` — count users with plan `founder` and status in entitled-paid set (`active`, `trialing`, `past_due`).
- `choose_price(db) -> tuple[price_id, plan]`
- `pricing_info(db) -> dict` — `{enabled, founder_price_cents, standard_price_cents, founder_seats, founder_seats_left, currency}`; prices retrieved from Stripe once per process and cached in memory.
- `create_checkout_session(user, db) -> url`
- `create_portal_session(user) -> url`
- `apply_subscription(user, subscription) -> None` — maps a Stripe Subscription object onto the user.
- `confirm_checkout(user, session_id, db) -> None`
- `handle_webhook(payload, sig_header) -> None` — verifies signature, handles `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` by re-fetching the subscription and applying it to the user found by `stripe_customer_id` (or by `client_reference_id` = user id for checkout completion).

### `app/auth.py`

- `get_current_user` (existing name, used by every dashboard router) now also raises `402 Payment Required` with detail `subscription_required` when billing is enabled and the user is not entitled.
- New `get_current_user_unrestricted` with the old behaviour, used by `/api/me*` and billing routes.

### `app/routers/billing.py`

- `GET /api/billing/pricing` public.
- `GET /api/billing/status` unrestricted: `{enabled, entitled, status, plan, current_period_end, has_customer}`.
- `POST /api/billing/checkout` unrestricted: 409 if already entitled and paid; returns `{url}`.
- `POST /api/billing/confirm` unrestricted: body `{session_id}`; returns status payload.
- `POST /api/billing/portal` unrestricted: 400 if no customer; returns `{url}`.
- `POST /api/webhooks/stripe`: raw body + `Stripe-Signature`; 400 on bad signature; 200 otherwise.

### `scripts/stripe_setup.py`

Creates product "TimeIQ" and two recurring yearly prices (500 and 2900 USD cents), prints the env lines to set.

## Frontend

- `lib/billing.ts`: types and `fetchPricing()`.
- `components/billing/pricing-card.tsx`: shows founder price with seats left, or standard price when seats are gone; CTA. Signed out → `/sign-up?redirect_url=/billing/checkout`. Signed in → POST checkout and redirect to Stripe. Fires pixel `InitiateCheckout`.
- `components/billing/subscription-gate.tsx`: client component wrapped around dashboard children in the dashboard layout; fetches status; while loading shows the clock loader; if billing enabled and not entitled renders a paywall with the pricing card; otherwise renders children.
- `app/pricing/page.tsx`: public page, header like landing, pricing card, FAQ (what's included, cancel anytime, founder price locked for life).
- `app/billing/checkout/page.tsx`: protected; calls checkout and redirects; used as the post-sign-up redirect.
- `app/billing/success/page.tsx`: protected; confirms with `session_id`, fires pixel `Purchase` (value 5 or 29, USD), shows confirmation and "Go to dashboard".
- Settings: Billing card with plan, status, renewal date, "Manage billing" (portal) or "Subscribe" (pricing).
- Landing page: pricing section reusing the card, nav link, hero chips become "$5/year founding price · Cancel anytime · Founder price locked for life"; CTA copy updated.
- `apiFetch`: on 402 redirect to `/pricing?reason=subscription`.
- `components/meta-pixel.tsx`: loads fbevents when `NEXT_PUBLIC_META_PIXEL_ID` is set, tracks PageView; exports `track(event, params)`.
- Middleware: add `/pricing` to public routes.

## Marketing

`docs/marketing/2026-09-facebook-founder-campaign.md`: objective, budget ($5/day, 14 days), audience, placements, three ad variants, creative direction, UTM links, pixel events, launch checklist, and the metrics that decide go/no-go.

## Testing

Unit tests for `is_entitled`, `plan_for_price`, and webhook signature rejection with a bad secret. Manual: with no keys, dashboard unchanged; with test keys, full checkout in Stripe test mode using card 4242.

## Out of scope

Monthly plans, coupons, team seats, refunds automation, tax collection, dunning emails beyond Stripe's own.
