"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarPicker } from "@/components/booking/calendar-picker";
import { TimeSlots } from "@/components/booking/time-slots";
import { BookingForm, BookingFormData } from "@/components/booking/booking-form";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { Calendar, Clock, CheckCircle2, ArrowLeft, MapPin, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoIcon } from "@/components/logo";
import { ClockLoader } from "@/components/ui/clock-loader";
import { describeSlot, guestTimeZone, timeZoneLabel } from "@/lib/booking-time";
import { bookingPrice, REFUND_POLICY } from "@/lib/booking-payments";

interface EventType {
  price_cents: number | null;
  currency: string;
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  location: string | null;
  color: string;
  buffer_minutes: number;
  host_name: string | null;
  collect_phone: boolean;
  require_phone: boolean;
  collect_company: boolean;
  require_company: boolean;
  collect_url: boolean;
  require_url: boolean;
}

interface AvailableSlot {
  start: string;
}

export default function BookingFlowPage() {
  const params = useParams();
  const username = params.username as string;
  const eventSlug = params.eventSlug as string;

  const [eventType, setEventType] = useState<EventType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the host's calendars finish re-syncing, so slots refetch quietly.
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [slotsError, setSlotsError] = useState(false);
  // Numbers each slots request. Only the newest one may update the list, so a
  // slow response for a previous date never shows up under the current one.
  const [slotRequests] = useState(() => ({ latest: 0 }));

  useEffect(() => {
    fetchEventType();
    refreshCalendars();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (calendarVersion > 0 && selectedDate) {
      fetchAvailableSlots(selectedDate, { quiet: true });
    }
  }, [calendarVersion]);

  function selectDate(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setAvailableSlots([]);
  }

  async function refreshCalendars() {
    try {
      const { refreshed } = await apiFetch<{ refreshed: boolean }>(
        `/api/public/${username}/calendars/refresh`,
        { method: "POST" }
      );
      if (refreshed) setCalendarVersion((v) => v + 1);
    } catch {
      // The cached calendar still applies; booking re-checks before confirming.
    }
  }

  async function fetchEventType() {
    try {
      const data = await apiFetch<EventType>(
        `/api/public/${username}/${eventSlug}`
      );
      setEventType(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableSlots(date: Date, { quiet = false } = {}) {
    const request = ++slotRequests.latest;
    if (!quiet) {
      setSlotsLoading(true);
      setSlotsError(false);
      setSelectedSlot(null);
    }
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const data = await apiFetch<AvailableSlot[]>(
        `/api/public/${username}/${eventSlug}/slots?date=${dateStr}`
      );
      if (request !== slotRequests.latest) return;
      setAvailableSlots(data);
      setSlotsError(false);
      // A quiet refetch keeps the visitor's pick unless that time just got taken.
      setSelectedSlot((prev) =>
        quiet && data.some((slot) => slot.start === prev) ? prev : null
      );
    } catch (e: any) {
      if (request !== slotRequests.latest) return;
      console.error("Failed to fetch slots:", e);
      if (quiet) return;
      setAvailableSlots([]);
      setSlotsError(true);
    } finally {
      if (request === slotRequests.latest) setSlotsLoading(false);
    }
  }

  async function handleBooking(formData: BookingFormData) {
    if (!selectedDate || !selectedSlot) return;

    setBookingLoading(true);
    try {
      // The selection is the slot's ISO start, so what was picked is what gets booked.
      const selectedSlotObj = availableSlots.find((slot) => slot.start === selectedSlot);

      if (!selectedSlotObj) {
        throw new Error("That time is no longer listed. Pick another time.");
      }

      const booking = await apiFetch<{ status: string; checkout_url: string | null }>(`/api/public/${username}/${eventSlug}/book`, {
        method: "POST",
        body: JSON.stringify({
          visitor_name: formData.name,
          visitor_email: formData.email,
          visitor_notes: formData.notes || null,
          visitor_phone: formData.phone || null,
          visitor_company: formData.company || null,
          visitor_url: formData.url || null,
          starts_at: selectedSlotObj.start,
          timezone: guestTimeZone(),
        }),
      });
      if (booking.status === "pending_payment" && booking.checkout_url) {
        window.location.assign(booking.checkout_url);
        return;
      }
      setBookingConfirmed(true);
    } catch (e: any) {
      alert(`Booking failed: ${e.message}`);
      // The time may have just been taken; show what is still open.
      fetchAvailableSlots(selectedDate, { quiet: true });
    } finally {
      setBookingLoading(false);
    }
  }

  if (loading) {
    return <ClockLoader fullscreen size="lg" label="Preparing your booking" />;
  }

  if (error || !eventType) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-6">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative glass rounded-[1.5rem] p-10 text-center max-w-md">
          <h1 className="text-3xl font-display mb-3">Booking unavailable</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            {error || "This event is unavailable. Choose another event or contact the host."}
          </p>
          <Link href={`/book/${username}`}>
            <Button variant="glass">
              <ArrowLeft className="h-4 w-4" />
              Back to profile
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (bookingConfirmed && selectedSlot) {
    const booked = describeSlot(selectedSlot);
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-6">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative reveal reveal-1 max-w-md w-full">
          {/* Celebratory aurora glow */}
          <div
            aria-hidden
            className="absolute inset-0 -m-8 rounded-full opacity-80"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 40%, hsl(var(--aurora-4) / 0.35), transparent 70%)",
              filter: "blur(30px)",
            }}
          />

          <div className="relative glass glass-chroma rounded-[1.75rem] p-10 text-center">
            <div className="relative mb-6 inline-flex">
              <div
                aria-hidden
                className="absolute inset-0 -m-2 rounded-full bg-[hsl(var(--aurora-4))] opacity-30 blur-xl"
              />
              <div className="relative w-16 h-16 rounded-2xl bg-[linear-gradient(135deg,hsl(var(--aurora-4)),hsl(var(--aurora-2)))] flex items-center justify-center shadow-[0_16px_40px_-10px_hsl(var(--aurora-4)/0.55)]">
                <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground/80 mb-2">
              Booking confirmed
            </div>
            <h2 className="font-display text-4xl tracking-[-0.025em] mb-6">
              You&apos;re all set.
            </h2>

            <div className="space-y-2 mb-7">
              <p className="font-semibold text-lg">{eventType.name}</p>
              <p className="text-sm text-muted-foreground font-mono tabular-nums">
                {booked.date}
              </p>
              <p className="text-sm text-muted-foreground font-mono tabular-nums">
                {booked.time}
              </p>
              <p className="text-xs text-muted-foreground/80 font-mono">
                {timeZoneLabel(new Date(selectedSlot))}
              </p>
              {eventType.location && (
                <div className="text-sm text-muted-foreground pt-1">
                  {eventType.location.startsWith("http://") ||
                  eventType.location.startsWith("https://") ? (
                    <a
                      href={eventType.location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-foreground transition-colors underline underline-offset-4 decoration-foreground/20"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Join meeting
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      {eventType.location}
                    </span>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground mb-7">
              A confirmation email with a calendar invite is on its way.
            </p>

            <Link href={`/book/${username}`}>
              <Button variant="glass" className="w-full">
                <ArrowLeft className="h-4 w-4" />
                Back to profile
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden pb-16">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />

      <div className="relative container mx-auto px-6 lg:px-10 py-10 max-w-6xl">
        <Link
          href={`/book/${username}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 font-mono uppercase tracking-[0.15em] text-[11px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>

        {/* Event header */}
        <div className="mb-10 reveal reveal-1">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: eventType.color }}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground/80">
              With {eventType.host_name || username}
            </span>
          </div>

          <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.025em] leading-[1.05] mb-5 max-w-3xl">
            {eventType.name}
          </h1>

          <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
            <div className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">
                {eventType.duration_minutes} minutes
              </span>
            </div>
            {eventType.price_cents != null && <span>{bookingPrice(eventType.price_cents, eventType.currency)}</span>}
            {eventType.location && (
              <div className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {eventType.location.startsWith("http://") ||
                eventType.location.startsWith("https://") ? (
                  <a
                    href={eventType.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground transition-colors underline underline-offset-4 decoration-foreground/20"
                  >
                    {eventType.location
                      .replace(/^https?:\/\//, "")
                      .split("/")[0]}
                  </a>
                ) : (
                  <span>{eventType.location}</span>
                )}
              </div>
            )}
          </div>

          {eventType.description && (
            <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-2xl text-pretty">
              {eventType.description}
            </p>
          )}
          {eventType.price_cents != null && <p className="mt-4 text-sm text-muted-foreground">{REFUND_POLICY}</p>}
        </div>

        {/* Booking grid */}
        <div className="grid lg:grid-cols-2 gap-5 reveal reveal-2">
          <div className="glass rounded-[1.5rem] p-6 lg:p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Pick a date
              </h3>
              <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
            </div>
            <CalendarPicker
              selectedDate={selectedDate}
              onDateSelect={selectDate}
            />
          </div>

          <div className="space-y-5">
            {selectedDate ? (
              <>
                <div className="glass rounded-[1.5rem] p-6 lg:p-7">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      Available times
                    </h3>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                  </div>
                  <p className="text-lg font-display mb-1">
                    {format(selectedDate, "EEEE, MMMM d")}
                  </p>
                  {slotsError ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-muted-foreground mb-3">
                        Times for this date didn&apos;t load.
                      </p>
                      <Button
                        variant="glass"
                        size="sm"
                        onClick={() => fetchAvailableSlots(selectedDate)}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <TimeSlots
                      slots={availableSlots}
                      date={selectedDate}
                      selectedSlot={selectedSlot}
                      onSlotSelect={setSelectedSlot}
                      loading={slotsLoading}
                    />
                  )}
                </div>

                {selectedSlot && (
                  <div className="glass rounded-[1.5rem] p-6 lg:p-7 reveal reveal-1">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        Your details
                      </h3>
                      <span className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
                        {format(new Date(selectedSlot), "MMM d")} ·{" "}
                        {format(new Date(selectedSlot), "h:mm a")}
                      </span>
                    </div>
                    <BookingForm
                      submitLabel={eventType.price_cents != null ? `Continue to payment · ${bookingPrice(eventType.price_cents, eventType.currency)}` : "Confirm booking"}
                      onSubmit={handleBooking}
                      loading={bookingLoading}
                      collectPhone={eventType.collect_phone}
                      requirePhone={eventType.require_phone}
                      collectCompany={eventType.collect_company}
                      requireCompany={eventType.require_company}
                      collectUrl={eventType.collect_url}
                      requireUrl={eventType.require_url}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="glass rounded-[1.5rem] py-16 text-center text-muted-foreground text-sm">
                Select a date to see available times
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-16 pt-10 border-t border-foreground/5">
          <LogoIcon className="w-4 h-4" />
          <span className="text-xs text-muted-foreground">
            Powered by{" "}
            <Link
              href="/?utm_source=booking_page&utm_medium=powered_by"
              className="font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              TimeIQ
            </Link>
            , a{" "}
            <a
              href="https://yoyocode.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              Yoyo Code
            </a>{" "}
            creation
          </span>
        </div>
      </div>
    </div>
  );
}
