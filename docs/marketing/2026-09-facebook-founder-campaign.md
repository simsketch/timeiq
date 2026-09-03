# TimeIQ Founding Member Campaign (Facebook / Instagram)

Goal: find out whether strangers will pay for TimeIQ. Budget $5/day for 14 days ($70). Success is measured in paid subscriptions, nothing else.

## Before launch (checklist)

1. **Stripe live mode** (done 2026-09-03: live product, prices, webhook, and portal exist; price ids and seat count are on Vercel)
   - Still needed on the **backend** Vercel project: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, added from your terminal, then redeploy.
   - `scripts/stripe_setup.py` is idempotent; rerun it any time to repair the product, prices, webhook, or portal config.
   - Test once with a real card at $5, then refund yourself from the Stripe dashboard if you like. Confirm the success page says "You're in" and Settings shows the Billing card.
2. **Meta Pixel**
   - Events Manager → Create pixel → copy the id. Set `NEXT_PUBLIC_META_PIXEL_ID` on the **frontend** Vercel project and redeploy.
   - The site fires `PageView` on every page, `InitiateCheckout` on the pricing button, and `Purchase` (value 5 or 29 USD) on the success page. Verify with the Meta Pixel Helper extension.
3. **Clerk production keys** are still dev keys in prod (see memory note). Swap them before spending money, since dev keys cap sign-ups and show a dev banner.
4. Confirm the landing page loads fast on mobile. Most ad traffic is mobile.

## What the market is doing (researched 2026-09-03)

- **Calendly barely runs paid social.** Its growth came from the booking link itself (every invite is an ad), a freemium tier, and LinkedIn content, which drove about 60 percent of its referral traffic. There is no Calendly ad creative to copy, and matching an incumbent's hooks is a losing move anyway: mid-2026 Meta practitioners report that "hooks matching competitors get ignored, regardless of quality."
- **The cheap end of the market sells on price shock.** TidyCal ($29 lifetime, 200k signups via AppSumo) and ZCal ($49 lifetime) win with a single number that sounds wrong. "$5 a year" belongs in that lane, so lead with the price and treat the feature list as support.
- **What is scaling on Meta right now**: static images still carry 60 to 70 percent of conversions; the "322" test (3 creatives, 2 headlines, 2 primary texts, 12 combinations in one ad set) beats spreading budget across many ad sets; one primary text short (about 180 characters) and one long enough to need "see more"; hook shapes that keep working are "If you..." and "How to know if..."; listicle-style landing pages converted cheaper than product pages ($62 vs $85 per purchase in one account).
- **Small-budget rules**: Meta needs about 50 conversion events or 7 days to leave the learning phase, and every edit resets it. Check on day 8, not day 2. Scale by at most 20 percent a day once cost per purchase is under target. Founders reporting $5/day tests describe it as enough for retargeting or a single-message test, not for broad prospecting, so keep exactly one ad set.
- **Creative enhancement settings**: turn off Meta's text generation, enhanced CTA, and 3D animation; leave on visual touch-ups, relevant comments, and sitelinks.

Sources: Foundation Inc and Sacra case studies on Calendly, Indie Hackers threads on $5/day SaaS tests, TidyCal and ZCal AppSumo listings, What Marketing Works July 2026 Meta report.

## Campaign structure

- **Objective**: Sales (conversion), optimized for the `Purchase` event. If Meta refuses to optimize on Purchase because of low volume in week one, run week one on `InitiateCheckout`, then switch.
- **Budget**: $5/day, campaign budget, 14 days. Do not touch it for the first 4 days; the algorithm needs the data.
- **One ad set, "322" ads**: one ad using the three creatives below with the two headlines and two primary texts listed for it, so Meta tests 12 combinations without splitting the budget. If Ads Manager forces a single ad, run the three ads below instead.
- **Placements**: Advantage+ (automatic). Feeds and Reels will get most of it.
- **Landing URL**: `https://<frontend-domain>/?utm_source=facebook&utm_medium=paid&utm_campaign=founder100&utm_content={{ad.name}}`

## Audience

Pick one and keep it broad. Small budgets do badly with narrow targeting.

- **Location**: United States, Canada, United Kingdom, Australia.
- **Age**: 25 to 54.
- **Interests** (one ad set, OR'd together): Freelancing, Upwork, Fiverr, Calendly, Toggl, FreshBooks, Small business owners, Consulting.
- Leave gender, language, and detailed exclusions alone.

## Ads

Three static images (images, not a mix with video): (1) **"$5 a year. Yes, a year."** in the display font over the aurora background, (2) a clean screenshot of the timesheet grid with the invoice chip, (3) the pricing card cropped to "$5 / year · 100 of 100 spots left". Keep the logo small. Lead with the price everywhere; that is the one thing Calendly cannot say.

Short primary text (for the 322 pairing): **If you book calls, log hours, and send invoices, you are paying three apps. TimeIQ does all three for $5 a year. First 100 people lock it in for life.**

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
