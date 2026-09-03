"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { track } from "@/components/meta-pixel";
import { PricingInfo, fetchPricing, fmtCents, startCheckout } from "@/lib/billing";

const INCLUDED = [
  "Unlimited booking pages and event types",
  "Google Calendar and ICS sync",
  "Weekly timesheet and clients with rates",
  "PDF invoices emailed with a hosted link",
  "Founder price locked in for life",
];

export function PricingCard({ compact = false }: { compact?: boolean }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPricing().then(setPricing).catch(() => setPricing(null));
  }, []);

  const founderOpen = !!pricing && pricing.founder_price_cents !== null && pricing.founder_seats_left > 0;
  const price = pricing
    ? founderOpen
      ? pricing.founder_price_cents!
      : pricing.standard_price_cents
    : 500;
  const currency = pricing?.currency ?? "USD";

  async function subscribe() {
    track("InitiateCheckout", { value: price / 100, currency });
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/sign-up?redirect_url=/billing/checkout");
      return;
    }
    setBusy(true);
    try {
      const token = await getToken();
      window.location.href = await startCheckout(token);
    } catch (e: any) {
      toast({ title: "Checkout unavailable", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  }

  return (
    <div className="glass glass-chroma rounded-[1.75rem] p-7 sm:p-9 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.15em] bg-[hsl(var(--aurora-1)/0.1)] text-[hsl(var(--aurora-1))]">
          <Sparkles className="h-3 w-3" />
          {founderOpen ? "Founding member" : "Standard"}
        </div>
        {founderOpen && pricing && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {pricing.founder_seats_left} of {pricing.founder_seats} spots left
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display text-6xl tracking-[-0.03em]">{fmtCents(price, currency)}</span>
        <span className="text-muted-foreground">/ year</span>
      </div>
      <p className="text-sm text-muted-foreground mb-7 text-pretty">
        {founderOpen
          ? `The first ${pricing?.founder_seats ?? 100} subscribers pay ${fmtCents(price, currency)} a year, forever. After that it's ${fmtCents(pricing?.standard_price_cents ?? 2900, currency)}.`
          : "Everything in TimeIQ for less than a coffee a month. Cancel anytime."}
      </p>

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

      <Button variant="aurora" size="xl" className="w-full" onClick={subscribe} disabled={busy}>
        {busy ? "Opening checkout…" : founderOpen ? "Claim founder price" : "Subscribe"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Secure checkout by Stripe · Cancel anytime
      </p>
    </div>
  );
}
