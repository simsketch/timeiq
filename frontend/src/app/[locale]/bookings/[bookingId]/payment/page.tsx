"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { bookingPrice } from "@/lib/booking-payments";
import { Button } from "@/components/ui/button";

interface PaymentState {
  status: string;
  starts_at: string;
  price_cents: number;
  currency: string;
  checkout_url: string | null;
  refund_status: string | null;
}

export default function BookingPaymentPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const token = useSearchParams().get("token");
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("manageBooking.payment");
  const tb = useTranslations("booking");
  const locale = useLocale();

  useEffect(() => {
    if (!token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await apiFetch<PaymentState>(`/api/public/bookings/${bookingId}/payment?token=${encodeURIComponent(token!)}`, { cache: "no-store" });
        if (!active) return;
        setPayment(data);
        setError(null);
        if (data.status === "pending_payment") timer = setTimeout(poll, 3000);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : t("loadFailed"));
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [bookingId, token, t]);

  const confirmed = payment?.status === "confirmed";
  const pending = payment?.status === "pending_payment";
  return <main className="min-h-screen flex items-center justify-center px-6">
    <div className="max-w-md space-y-4 rounded-2xl border p-8">
      <h1 className="text-2xl font-bold">{confirmed ? t("confirmedTitle") : pending ? t("pendingTitle") : payment ? t("closedTitle") : t("checkingTitle")}</h1>
      {!token && <p role="alert">{t("incompleteLink")}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {payment && <p>{bookingPrice(payment.price_cents, payment.currency, locale)} · {new Date(payment.starts_at).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}</p>}
      {confirmed && <p>{t("confirmedBody")}</p>}
      {pending && <>
        <p>{t("pendingBody")}</p>
        {payment.checkout_url && <Button asChild><a href={payment.checkout_url}>{t("returnToCheckout")}</a></Button>}
      </>}
      {payment && !pending && !confirmed && <p>{payment.refund_status ? t("closedRefund") : t("closedHoldEnded")}</p>}
      {payment && <p className="text-xs text-muted-foreground">{tb("refundPolicy")}</p>}
    </div>
  </main>;
}
