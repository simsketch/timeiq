"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { timeZoneLabel } from "@/lib/booking-time";

interface BookingDetails {
  price_cents: number | null;
  refund_eligible: boolean;
  refund_policy: string | null;
  refund_status: string | null;
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  event_slug: string | null;
  username: string | null;
  event_type_name: string | null;
  duration_minutes: number | null;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <div className="text-muted-foreground mb-4">{children}</div>
      </div>
    </div>
  );
}

export default function CancelBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingId = params.bookingId as string;
  const token = searchParams.get("token");
  const t = useTranslations("manageBooking");
  const locale = useLocale();

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Read the clock once per visit so rendering stays pure.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    let active = true;
    apiFetch<BookingDetails>(
      `/api/public/bookings/${bookingId}?token=${encodeURIComponent(token)}`
    )
      .then((data) => {
        if (active) setBooking(data);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookingId, token]);

  async function handleCancel() {
    if (!token) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await apiFetch<{ refund_status: string | null }>(
        `/api/public/bookings/${bookingId}/cancel?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      setBooking((previous) => previous ? { ...previous, refund_status: result.refund_status } : previous);
      setCancelled(true);
    } catch (e: any) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return <ClockLoader fullscreen size="lg" label={t("loading")} />;
  }

  if (!token) {
    return (
      <Notice title={t("invalidLinkTitle")}>
        {t("cancel.invalidLinkBody")}
      </Notice>
    );
  }

  if (notFound || !booking) {
    return (
      <Notice title={t("notFoundTitle")}>
        {t("notFoundBody")}
      </Notice>
    );
  }

  const start = new Date(booking.starts_at);
  const eventName = booking.event_type_name || t("yourBooking");
  const when = (
    <div className="space-y-1">
      <p className="font-medium">{eventName}</p>
      <p className="text-sm text-muted-foreground">{start.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
      <p className="text-sm text-muted-foreground">
        {start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
        {booking.duration_minutes ? ` · ${t("minutes", { count: booking.duration_minutes })}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">{timeZoneLabel(start)}</p>
    </div>
  );

  if (cancelled) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-green-200/30 rounded-full blur-3xl" />
        <div className="max-w-md w-full mx-4 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-8 text-center relative">
          <div className="w-16 h-16 bg-green-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-6">{t("cancel.doneTitle")}</h2>
          <div className="mb-6">{when}</div>
          {booking.price_cents != null && <p className="text-sm mb-4">{booking.refund_status === "succeeded" ? t("cancel.refunded") : booking.refund_status === "pending" ? t("cancel.refundPending") : t("cancel.noRefund")}</p>}
          <p className="text-sm text-muted-foreground mb-6">
            {t("cancel.hostNotified")}
          </p>
          {booking.username && (
            <Link href={`/book/${booking.username}`}>
              <Button variant="outline" className="w-full">
                {t("bookAnother")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (["cancelled", "expired", "rescheduled"].includes(booking.status)) {
    return (
      <Notice title={t("alreadyCancelledTitle")}>
        {t("cancel.alreadyCancelledBody")}
      </Notice>
    );
  }

  if (start.getTime() <= openedAt) {
    return (
      <Notice title={t("passedTitle")}>
        {t("cancel.passedBody", {
          name: eventName,
          date: start.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" }),
          time: start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
        })}
      </Notice>
    );
  }

  const rescheduleHref = `/bookings/${bookingId}/reschedule?token=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center py-8">
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-red-200/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-orange-200/15 rounded-full blur-3xl" />

      <div className="max-w-md w-full mx-4 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-8 relative">
        <div className="flex items-center gap-3 mb-2">
          <XCircle className="h-5 w-5 text-red-500" />
          <h1 className="text-2xl font-bold tracking-tight">{t("cancel.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {booking.username ? t("cancel.subtitleWithHost", { name: booking.username }) : t("cancel.subtitle")}
        </p>

        <div className="rounded-xl border border-black/5 bg-white/70 p-4 mb-6">{when}</div>
        {booking.price_cents != null && <div className="text-sm text-muted-foreground mb-6 space-y-2">
          <p>{booking.refund_policy}</p>
          <p>{booking.status === "pending_payment" ? t("cancel.closesCheckout") : booking.refund_eligible ? t("cancel.willRefund") : t("cancel.wontRefund")}</p>
        </div>}

        {cancelError && (
          <p role="alert" className="text-sm text-red-700 mb-4">
            {cancelError}
          </p>
        )}

        <Button
          variant="destructive"
          className="w-full h-auto min-h-10 whitespace-normal"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? t("cancel.cancelling") : t("cancel.confirm")}
        </Button>
        <Link href={rescheduleHref} className="block mt-3">
          <Button variant="outline" className="w-full h-auto min-h-10 whitespace-normal">
            {t("pickDifferentTime")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
