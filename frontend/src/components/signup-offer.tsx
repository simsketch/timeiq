"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { fetchPricing, fmtCents, type PricingInfo } from "@/lib/billing";

/** Use the same live offer as Pricing; never promise sold-out founder seats. */
export function SignupOffer() {
  const t = useTranslations("auth.offer");
  const locale = useLocale();
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
      <p className="font-medium text-[#393933]">{t("noCard")}</p>
      {pricing && price !== null ? (
        <p className="mt-1">
          {t("offer", { count: pricing.free_meetings, price: fmtCents(price, pricing.currency, locale) })}
          {founderOpen && ` ${t("founder", { seats: pricing.founder_seats })}`}
          {" "}<Link href="/pricing" className="underline underline-offset-2">{t("seePlans")}</Link>
        </p>
      ) : (
        <p className="mt-1">{t("fallback")} <Link href="/pricing" className="underline underline-offset-2">{t("seePricing")}</Link></p>
      )}
    </div>
  );
}
