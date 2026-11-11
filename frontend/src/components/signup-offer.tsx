"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPricing, fmtCents, type PricingInfo } from "@/lib/billing";

/** Use the same live offer as Pricing; never promise sold-out founder seats. */
export function SignupOffer() {
  const [pricing, setPricing] = useState<PricingInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchPricing().then((value) => { if (mounted) setPricing(value); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const founderOpen = pricing?.founder_price_cents != null && pricing.founder_seats_left > 0;
  const price = pricing ? (founderOpen ? pricing.founder_price_cents! : pricing.standard_price_cents) : null;

  return (
    <div className="text-center text-xs leading-relaxed text-[#69695f]" aria-live="polite">
      <p className="font-medium text-[#393933]">No card needed. No payment at signup.</p>
      {pricing && price !== null ? (
        <p className="mt-1">
          Your first {pricing.free_meetings} meetings are free. Then {fmtCents(price, pricing.currency)}/year + tax.
          {founderOpen && ` Founder price for the first ${pricing.founder_seats} subscribers, locked in while you stay subscribed.`}
          {" "}<Link href="/pricing" className="underline underline-offset-2">See plans</Link>
        </p>
      ) : (
        <p className="mt-1">Start free, then choose a plan. <Link href="/pricing" className="underline underline-offset-2">See current pricing</Link></p>
      )}
    </div>
  );
}
