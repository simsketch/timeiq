# TimeIQ Founding Member Campaign (Facebook / Instagram)

Goal: find out whether strangers will pay for TimeIQ. Budget $5/day for 14 days ($70). Success is measured in paid subscriptions, nothing else.

## Before launch (checklist)

1. **Stripe live mode**
   - Run `STRIPE_SECRET_KEY=sk_live_... .venv/bin/python scripts/stripe_setup.py` from `backend/` and copy the two price ids it prints.
   - In Stripe Dashboard → Developers → Webhooks, add endpoint `https://<backend-domain>/api/webhooks/stripe` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy the signing secret.
   - In Stripe Dashboard → Settings → Billing → Customer portal, enable the portal and allow cancellation.
   - Set on the **backend** Vercel project: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDER`, `STRIPE_PRICE_STANDARD`, `FOUNDER_SEATS=100`. Redeploy.
   - Test once with a real card at $5, then refund yourself from the Stripe dashboard if you like. Confirm the success page says "You're in" and Settings shows the Billing card.
2. **Meta Pixel**
   - Events Manager → Create pixel → copy the id. Set `NEXT_PUBLIC_META_PIXEL_ID` on the **frontend** Vercel project and redeploy.
   - The site fires `PageView` on every page, `InitiateCheckout` on the pricing button, and `Purchase` (value 5 or 29 USD) on the success page. Verify with the Meta Pixel Helper extension.
3. **Clerk production keys** are still dev keys in prod (see memory note). Swap them before spending money, since dev keys cap sign-ups and show a dev banner.
4. Confirm the landing page loads fast on mobile. Most ad traffic is mobile.

## Campaign structure

- **Objective**: Sales (conversion), optimized for the `Purchase` event. If Meta refuses to optimize on Purchase because of low volume in week one, run week one on `InitiateCheckout`, then switch.
- **Budget**: $5/day, campaign budget, 14 days. Do not touch it for the first 4 days; the algorithm needs the data.
- **One ad set, three ads.** Let Meta pick the winner.
- **Placements**: Advantage+ (automatic). Feeds and Reels will get most of it.
- **Landing URL**: `https://<frontend-domain>/?utm_source=facebook&utm_medium=paid&utm_campaign=founder100&utm_content={{ad.name}}`

## Audience

Pick one and keep it broad. Small budgets do badly with narrow targeting.

- **Location**: United States, Canada, United Kingdom, Australia.
- **Age**: 25 to 54.
- **Interests** (one ad set, OR'd together): Freelancing, Upwork, Fiverr, Calendly, Toggl, FreshBooks, Small business owners, Consulting.
- Leave gender, language, and detailed exclusions alone.

## Ads

Use one static image or a 10 second screen recording of the timesheet turning into an invoice. Text on the creative: **"$5 a year. Yes, a year."** in the display font over the aurora background. Keep the logo small.

### Ad 1: Price anchor

- **Primary text**: Calendly for booking. Toggl for hours. FreshBooks for invoices. Or one calm app that does all three for $5 a year. The first 100 people lock that price in for life.
- **Headline**: Scheduling, timesheets, and invoices. $5/year.
- **Description**: Founding member price, locked forever. Cancel anytime.
- **CTA button**: Sign Up

### Ad 2: Freelancer pain

- **Primary text**: You did the work. Now you get to chase the booking, rebuild the timesheet from memory, and hand-write the invoice. TimeIQ does all three in one place. Log hours in a weekly grid, click once, and a PDF invoice lands in your client's inbox.
- **Headline**: From booked meeting to paid invoice.
- **Description**: $5/year for the first 100 founding members.
- **CTA button**: Learn More

### Ad 3: Curiosity, short

- **Primary text**: We priced our scheduling + invoicing app at $5 a year for the first 100 people. Not a typo. We want users, not a spreadsheet of trials.
- **Headline**: 100 founder spots. $5 a year.
- **Description**: Booking pages, timesheets, PDF invoices.
- **CTA button**: Sign Up

## What to watch (check daily after day 4)

| Metric | Where | Healthy at $5/day |
|---|---|---|
| Link clicks | Ads Manager | 10 to 30 per day |
| Cost per click | Ads Manager | under $1.00 |
| Landing page → sign-up | Clerk users list vs clicks | 5 to 15 percent |
| Sign-up → paid | Stripe customers vs Clerk users | 30 percent or more (the $5 price should convert most sign-ups) |
| Purchases | Stripe, and the pixel `Purchase` count | 1 or more per $10 spent is a strong signal |

## Decision at day 14

- **3 or more paying subscribers from ads**: the offer works. Raise the budget to $10/day, keep the winning ad, and write a second creative in the same vein.
- **Clicks but no sign-ups**: the landing page is the problem. Tighten the hero to the price and the three features, and move the pricing card above the fold.
- **Sign-ups but no payments**: the paywall is the problem. Consider a 7-day trial before the founder price.
- **Few clicks**: the creative is the problem. Swap the image for a screen recording and lead with the price.

## Things I could not do for you

Creating the campaign, uploading creative, and setting the budget happen inside your Meta Ads account and spend your money, so those steps are yours. Everything on the site side (pixel, events, pricing page, checkout, UTM-friendly URLs) is built and only needs the env vars above.
