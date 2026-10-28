"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { bookingPrice, REFUND_POLICY } from "@/lib/booking-payments";
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
        if (active) setError(e instanceof Error ? e.message : "Payment status did not load. Reload this page to try again.");
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [bookingId, token]);

  const confirmed = payment?.status === "confirmed";
  const pending = payment?.status === "pending_payment";
  return <main className="min-h-screen flex items-center justify-center px-6">
    <div className="max-w-md space-y-4 rounded-2xl border p-8">
      <h1 className="text-2xl font-bold">{confirmed ? "Booking confirmed" : pending ? "Waiting for payment confirmation" : payment ? "Checkout closed" : "Checking your booking"}</h1>
      {!token && <p role="alert">This payment link is incomplete. Open the complete address from checkout.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {payment && <p>{bookingPrice(payment.price_cents, payment.currency)} · {new Date(payment.starts_at).toLocaleString()}</p>}
      {confirmed && <p>Your payment is complete. Your confirmation email includes a calendar invite and links to reschedule or cancel.</p>}
      {pending && <>
        <p>This page checks automatically. Stripe may take a moment to confirm a completed payment. If you left checkout before paying, you can return while your slot is held.</p>
        {payment.checkout_url && <Button asChild><a href={payment.checkout_url}>Return to checkout</a></Button>}
      </>}
      {payment && !pending && !confirmed && <p>{payment.refund_status ? "A full refund was requested for this closed checkout." : "The slot hold has ended. Open the host's booking page to choose another time."}</p>}
      {payment && <p className="text-xs text-muted-foreground">{REFUND_POLICY}</p>}
    </div>
  </main>;
}
