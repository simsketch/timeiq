"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { BOOKING_CURRENCIES, ConnectStatus } from "@/lib/booking-payments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BookingPriceFields({ price, currency, onChange, onSetupClick }: {
  onSetupClick?: () => void;
  price: string; currency: string; onChange: (price: string, currency: string) => void;
}) {
  const { getToken } = useAuth();
  const t = useTranslations("eventTypes.price");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const token = await getToken();
        const status = await apiFetch<ConnectStatus>("/api/connect/status", { headers: { Authorization: `Bearer ${token}` } });
        if (active) setReady(status.enabled && status.status === "ready");
      } catch { /* The server also checks readiness when saving. */ }
    }
    load();
    return () => { active = false; };
  }, [getToken]);

  return <div className="space-y-2">
    <Label htmlFor="booking-price">{t("label")}</Label>
    <div className="flex gap-2">
      <Input id="booking-price" type="number" min="0.50" max="999999.99" step="0.01" placeholder={t("free")} value={price}
        disabled={!ready} onChange={(e) => onChange(e.target.value, currency)} />
      <select aria-label={t("currency")} className="rounded-md border bg-background px-2 text-sm" value={currency}
        disabled={!ready} onChange={(e) => onChange(price, e.target.value)}>
        {BOOKING_CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
      </select>
    </div>
    <p className="text-xs text-muted-foreground">{t("help")}</p>
    {!ready && <p className="text-xs text-muted-foreground">{t.rich("setup", { link: (chunks) => <Link href="/event-types#payments" onClick={onSetupClick} className="underline">{chunks}</Link> })} {price && <button type="button" className="underline" onClick={() => onChange("", currency)}>{t("makeFree")}</button>}</p>}
  </div>;
}
