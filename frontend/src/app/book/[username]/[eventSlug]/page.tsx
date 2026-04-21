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

interface EventType {
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

  useEffect(() => {
    fetchEventType();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots();
    }
  }, [selectedDate]);

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

  async function fetchAvailableSlots() {
    if (!selectedDate) return;
    setSlotsLoading(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const data = await apiFetch<AvailableSlot[]>(
        `/api/public/${username}/${eventSlug}/slots?date=${dateStr}`
      );
      setAvailableSlots(data);
      setSelectedSlot(null);
    } catch (e: any) {
      console.error("Failed to fetch slots:", e);
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function handleBooking(formData: BookingFormData) {
    if (!selectedDate || !selectedSlot) return;

    setBookingLoading(true);
    try {
      const selectedSlotObj = availableSlots.find(
        (slot) => format(new Date(slot.start), "h:mm a") === selectedSlot
      );

      if (!selectedSlotObj) {
        throw new Error("Selected slot not found");
      }

      await apiFetch(`/api/public/${username}/${eventSlug}/book`, {
        method: "POST",
        body: JSON.stringify({
          visitor_name: formData.name,
          visitor_email: formData.email,
          visitor_notes: formData.notes || null,
          visitor_phone: formData.phone || null,
          visitor_company: formData.company || null,
          visitor_url: formData.url || null,
          starts_at: selectedSlotObj.start,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setBookingConfirmed(true);
    } catch (e: any) {
      alert(`Booking failed: ${e.message}`);
    } finally {
      setBookingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--aurora-1))] animate-pulse" />
          Loading
        </div>
      </div>
    );
  }

  if (error || !eventType) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-6">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative glass rounded-[1.5rem] p-10 text-center max-w-md">
          <h1 className="text-3xl font-display mb-3">Not found</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            This event type doesn&apos;t exist or is not available.
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

  if (bookingConfirmed) {
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
                {selectedDate && format(selectedDate, "EEEE · MMM d, yyyy")}
              </p>
              <p className="text-sm text-muted-foreground font-mono tabular-nums">
                {selectedSlot}
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
              onDateSelect={setSelectedDate}
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
                  <p className="text-lg font-display mb-5">
                    {format(selectedDate, "EEEE, MMMM d")}
                  </p>
                  <TimeSlots
                    slots={availableSlots.map((slot) =>
                      format(new Date(slot.start), "h:mm a")
                    )}
                    selectedSlot={selectedSlot}
                    onSlotSelect={setSelectedSlot}
                    loading={slotsLoading}
                  />
                </div>

                {selectedSlot && (
                  <div className="glass rounded-[1.5rem] p-6 lg:p-7 reveal reveal-1">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        Your details
                      </h3>
                      <span className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
                        {format(selectedDate, "MMM d")} · {selectedSlot}
                      </span>
                    </div>
                    <BookingForm
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
              href="/"
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
