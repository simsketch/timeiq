"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingInfo, fetchPricing, fmtCents } from "@/lib/billing";

/**
 * Live founder-price pill linking to pricing. Shows seats remaining once the
 * pricing endpoint answers; renders a static fallback before that.
 */
export function FounderPill({ href = "/pricing", compact = false, className }: { href?: string; compact?: boolean; className?: string }) {
  const [pricing, setPricing] = useState<PricingInfo | null>(null);

  useEffect(() => {
    fetchPricing().then(setPricing).catch(() => null);
  }, []);

  const founderOpen = !pricing || (pricing.founder_price_cents !== null && pricing.founder_seats_left > 0);
  const price = pricing?.founder_price_cents ?? 500;
  const currency = pricing?.currency ?? "USD";

  if (!founderOpen) {
    return (
      <Link href={href} className={cn("inline-flex items-center gap-2 glass rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors", className)}>
        {fmtCents(pricing!.standard_price_cents, currency)}/year, cancel anytime
        <ArrowRight className="h-3 w-3" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2 glass rounded-full pl-2.5 pr-3.5 py-1.5 text-xs font-medium text-foreground/85 hover:text-foreground transition-colors",
        className
      )}
    >
      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[hsl(var(--aurora-1)/0.14)] px-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[hsl(var(--aurora-1))]">
        <Sparkles className="h-3 w-3" />
        Founder
      </span>
      <span>
        {fmtCents(price, currency)}/year
        {!compact && pricing && (
          <span className="text-muted-foreground"> · {pricing.founder_seats_left} of {pricing.founder_seats} spots left</span>
        )}
        {!compact && !pricing && <span className="text-muted-foreground"> · first 100 only</span>}
      </span>
      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
