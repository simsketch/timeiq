"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { timeZoneLabel } from "@/lib/booking-time";

interface BookingDetails {
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
      await apiFetch(
        `/api/public/bookings/${bookingId}/cancel?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      setCancelled(true);
    } catch (e: any) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return <ClockLoader fullscreen size="lg" label="Loading booking" />;
  }

  if (!token) {
    return (
      <Notice title="Invalid Link">
        This cancellation link is incomplete. Open the Cancel link in your confirmation email
        again, or copy the whole address into your browser.
      </Notice>
    );
  }

  if (notFound || !booking) {
    return (
      <Notice title="Link Expired or Invalid">
        We couldn&apos;t find a booking for this link. If you rescheduled, use the link in your
        most recent confirmation email.
      </Notice>
    );
  }

  const start = new Date(booking.starts_at);
  const eventName = booking.event_type_name || "Your booking";
  const when = (
    <div className="space-y-1">
      <p className="font-medium">{eventName}</p>
      <p className="text-sm text-muted-foreground">{format(start, "EEEE, MMMM d, yyyy")}</p>
      <p className="text-sm text-muted-foreground">
        {format(start, "h:mm a")}
        {booking.duration_minutes ? ` · ${booking.duration_minutes} minutes` : ""}
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
          <h2 className="text-2xl font-bold tracking-tight mb-6">Booking cancelled</h2>
          <div className="mb-6">{when}</div>
          <p className="text-sm text-muted-foreground mb-6">
            The host has been told, and a confirmation is on its way to your email.
          </p>
          {booking.username && (
            <Link href={`/book/${booking.username}`}>
              <Button variant="outline" className="w-full">
                Book another time
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (booking.status === "cancelled") {
    return (
      <Notice title="Already Cancelled">
        This booking was already cancelled, so there&apos;s nothing more to do. If you rescheduled
        it, your new booking has its own links in its confirmation email.
      </Notice>
    );
  }

  if (start.getTime() <= openedAt) {
    return (
      <Notice title="This Booking Has Passed">
        {eventName} started on {format(start, "MMMM d, yyyy 'at' h:mm a")}, so it can no longer be
        cancelled.
      </Notice>
    );
  }

  const rescheduleHref = `/bookings/${bookingId}/reschedule?token=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center py-8">
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-red-200/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-200/15 rounded-full blur-3xl" />

      <div className="max-w-md w-full mx-4 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-8 relative">
        <div className="flex items-center gap-3 mb-2">
          <XCircle className="h-5 w-5 text-red-500" />
          <h1 className="text-2xl font-bold tracking-tight">Cancel booking?</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {booking.username ? `With ${booking.username}. ` : ""}This frees the time for others.
        </p>

        <div className="rounded-xl border border-black/5 bg-white/70 p-4 mb-6">{when}</div>

        {cancelError && (
          <p role="alert" className="text-sm text-red-700 mb-4">
            {cancelError}
          </p>
        )}

        <Button
          variant="destructive"
          className="w-full"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? "Cancelling..." : "Yes, cancel this booking"}
        </Button>
        <Link href={rescheduleHref} className="block mt-3">
          <Button variant="outline" className="w-full">
            Pick a different time
          </Button>
        </Link>
      </div>
    </div>
  );
}
