"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { track } from "@/components/meta-pixel";
import { PricingInfo, fetchPricing, fmtCents, startCheckout, startGuestCheckout } from "@/lib/billing";
import { hasSessionCookie } from "@/lib/session-cookie";

const INCLUDED = [
  "Google, Outlook, iCloud and any calendar link in one view",
  "Unlimited booking pages and event types",
  "Email a schedule and it lands on your calendar",
  "Share your availability as text or a picture, in any time zone",
  "Group meetings that find a time for everyone",
  "Founder price locked in for life",
];

const noSubscribe = () => () => {};

/** For pages inside Clerk: checks out the signed-in account directly. */
export function PricingCard({ compact = false }: { compact?: boolean }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const checkoutUrl = async () => (isSignedIn ? startCheckout(await getToken()) : startGuestCheckout());
  return <PricingCardView compact={compact} ready={isLoaded} checkoutUrl={checkoutUrl} />;
}

/** Free and paid side by side, for pages inside Clerk. */
export function PricingCards() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const checkoutUrl = async () => (isSignedIn ? startCheckout(await getToken()) : startGuestCheckout());
  return (
    <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto items-stretch">
      <FreeCard signedIn={!!isSignedIn} />
      <PricingCardView compact={false} ready={isLoaded} checkoutUrl={checkoutUrl} secondary />
    </div>
  );
}

/**
 * For public pages that skip Clerk. Signed-in visitors finish on
 * /billing/checkout, which has Clerk; everyone else goes straight to Stripe.
 */
export function PublicPricingCards({ headline }: { headline?: string }) {
  const signedIn = useSyncExternalStore(noSubscribe, hasSessionCookie, () => false);
  const checkoutUrl = async () => (hasSessionCookie() ? "/billing/checkout" : startGuestCheckout());
  return (
    <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto items-stretch">
      <FreeCard signedIn={signedIn} headline={headline} />
      <PricingCardView compact={false} ready checkoutUrl={checkoutUrl} headline={headline} secondary />
    </div>
  );
}

const FREE_INCLUDED = [
  "Every feature, nothing held back",
  "Your booking link and all your calendars",
  "Forward schedules and cc TimeIQ on threads",
  "Group meetings and shared availability",
];

/** Free to start: the first meetings are on us, no card. */
function FreeCard({ signedIn, headline }: { signedIn: boolean; headline?: string }) {
  const [freeMeetings, setFreeMeetings] = useState(7);
  useEffect(() => {
    fetchPricing().then((p) => p.free_meetings && setFreeMeetings(p.free_meetings)).catch(() => null);
  }, []);
  return (
    <div className="glass rounded-[1.75rem] p-7 sm:p-9 w-full flex flex-col">
      <div className="text-sm font-medium mb-6">Free to start</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display text-6xl tracking-[-0.03em]">$0</span>
        <span className="text-muted-foreground">for your first {freeMeetings} meetings</span>
      </div>
      <p className="text-sm text-muted-foreground mb-7 text-pretty">
        <span className="block font-medium text-foreground mb-1">No card needed.</span>
        Use all of TimeIQ until {freeMeetings} meetings are booked with you, then pick a plan to keep your link open.
      </p>
      <ul className="space-y-2.5 mb-8 text-sm">
        {FREE_INCLUDED.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--brand))]" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <Button asChild variant="brand" size="xl" className="w-full mt-auto">
        {signedIn ? (
          <Link href="/dashboard" className="gap-2">
            Go to your dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link href="/sign-up" className="gap-2" onClick={() => track("Lead", { ...(headline && { content_name: headline }) })}>
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </Button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Sign up with Google or email</p>
    </div>
  );
}

function PricingCardView({
  compact,
  ready,
  checkoutUrl,
  headline,
  secondary = false,
}: {
  compact: boolean;
  ready: boolean;
  checkoutUrl: () => Promise<string>;
  // Beside the Free card, which takes the primary button.
  secondary?: boolean;
  headline?: string;
}) {
  const { toast } = useToast();
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [pricingError, setPricingError] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadPricing() {
    return fetchPricing()
      .then((p) => {
        setPricing(p);
        setPricingError(false);
      })
      .catch(() => {
        setPricing(null);
        setPricingError(true);
      });
  }

  function retryPricing() {
    setPricingError(false);
    loadPricing();
  }

  useEffect(() => {
    loadPricing();
  }, []);

  // Only a price the server confirmed is shown or sold.
  const founderOpen = !!pricing && pricing.founder_price_cents !== null && pricing.founder_seats_left > 0;
  const price = pricing
    ? founderOpen
      ? pricing.founder_price_cents!
      : pricing.standard_price_cents
    : null;
  const currency = pricing?.currency ?? "USD";

  async function subscribe() {
    if (price === null) return;
    track("InitiateCheckout", { value: price / 100, currency, ...(headline && { content_name: headline }) });
    if (!ready) return;
    setBusy(true);
    try {
      // No account needed to pay; it's created right after checkout.
      window.location.href = await checkoutUrl();
    } catch (e: any) {
      toast({ title: "Checkout unavailable", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  }

  let buttonLabel = founderOpen ? "Claim founder price" : "Subscribe";
  if (price === null) buttonLabel = pricingError ? "Checkout unavailable" : "Loading price…";
  if (busy) buttonLabel = "Opening checkout…";

  return (
    <div className={`glass rounded-[1.75rem] p-7 sm:p-9 w-full flex flex-col ${secondary ? "" : "max-w-md mx-auto"}`}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="text-sm font-medium">
          {pricing ? (founderOpen ? "Founding member" : "Standard") : "TimeIQ"}
        </div>
        {founderOpen && pricing && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {pricing.founder_seats_left} of {pricing.founder_seats} spots left
          </span>
        )}
      </div>

      {pricing && price !== null ? (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-display text-6xl tracking-[-0.03em]">{fmtCents(price, currency)}</span>
            <span className="text-muted-foreground">/ year + tax</span>
          </div>
          <p className="text-sm text-muted-foreground mb-7 text-pretty">
            {founderOpen
              ? `The first ${pricing.founder_seats} subscribers pay ${fmtCents(price, currency)} a year, forever. After that it's ${fmtCents(pricing.standard_price_cents, currency)}.`
              : "Everything in TimeIQ for less than a coffee a month. Cancel anytime."}
          </p>
        </>
      ) : pricingError ? (
        <div className="mb-7" role="alert">
          <p className="font-display text-2xl tracking-[-0.02em] mb-2">Pricing didn&apos;t load.</p>
          <p className="text-sm text-muted-foreground mb-4 text-pretty">
            Check your connection and try again. Checkout opens once the current price loads.
          </p>
          <Button variant="outline" size="sm" onClick={retryPricing}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : (
        <div className="mb-7" aria-busy="true" aria-label="Loading pricing">
          <div className="h-[3.75rem] w-40 rounded-xl bg-foreground/[0.06] animate-pulse mb-3" />
          <div className="h-4 w-full rounded bg-foreground/[0.05] animate-pulse mb-2" />
          <div className="h-4 w-2/3 rounded bg-foreground/[0.05] animate-pulse" />
        </div>
      )}

      {!compact && (
        <ul className="space-y-2.5 mb-8 text-sm">
          {INCLUDED.map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant={secondary ? "outline" : "default"}
        size="xl"
        className="w-full mt-auto"
        onClick={subscribe}
        disabled={busy || price === null}
      >
        {buttonLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Secure checkout by Stripe · Cancel anytime</p>
    </div>
  );
}
