"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { track } from "@/components/meta-pixel";
import { PricingInfo, fetchPricing, fmtCents, startCheckout, startGuestCheckout } from "@/lib/billing";

const INCLUDED = [
  "Unlimited booking pages and event types",
  "Google Calendar and ICS sync",
  "Weekly timesheet and clients with rates",
  "PDF invoices emailed with a hosted link",
  "Founder price locked in for life",
];

export function PricingCard({ compact = false }: { compact?: boolean }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
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
    track("InitiateCheckout", { value: price / 100, currency });
    if (!isLoaded) return;
    setBusy(true);
    try {
      // No account needed to pay; it's created right after checkout.
      window.location.href = isSignedIn ? await startCheckout(await getToken()) : await startGuestCheckout();
    } catch (e: any) {
      toast({ title: "Checkout unavailable", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  }

  let buttonLabel = founderOpen ? "Claim founder price" : "Subscribe";
  if (price === null) buttonLabel = pricingError ? "Checkout unavailable" : "Loading price…";
  if (busy) buttonLabel = "Opening checkout…";

  return (
    <div className="glass glass-chroma rounded-[1.75rem] p-7 sm:p-9 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.15em] bg-[hsl(var(--aurora-1)/0.1)] text-[hsl(var(--aurora-1))]">
          <Sparkles className="h-3 w-3" />
          {pricing ? (founderOpen ? "Founding member" : "Standard") : "TimeIQ"}
        </div>
        {founderOpen && pricing && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
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
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--aurora-1))]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="aurora"
        size="xl"
        className="w-full"
        onClick={subscribe}
        disabled={busy || price === null}
      >
        {buttonLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Secure checkout by Stripe · Cancel anytime
      </p>
    </div>
  );
}
