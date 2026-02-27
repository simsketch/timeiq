"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CalendarPicker } from "@/components/booking/calendar-picker";
import { TimeSlots } from "@/components/booking/time-slots";
import { BookingForm, BookingFormData } from "@/components/booking/booking-form";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { Calendar, Clock, CheckCircle2, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface BookingDetails {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_notes: string | null;
  visitor_phone: string | null;
  visitor_company: string | null;
  visitor_reason: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  event_slug: string;
  username: string;
  event_type_name: string;
  duration_minutes: number;
}

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
  collect_company: boolean;
  collect_reason: boolean;
}

interface AvailableSlot {
  start: string;
}

export default function ReschedulePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingId = params.bookingId as string;
  const token = searchParams.get("token");

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) fetchBookingDetails();
  }, [token]);

  useEffect(() => {
    if (selectedDate && booking) {
      fetchAvailableSlots();
    }
  }, [selectedDate, booking]);

  async function fetchBookingDetails() {
    try {
      const data = await apiFetch<BookingDetails>(
        `/api/public/bookings/${bookingId}?token=${token}`
      );
      setBooking(data);

      // Also fetch event type details for intake field config
      if (data.username && data.event_slug) {
        const et = await apiFetch<EventType>(
          `/api/public/${data.username}/${data.event_slug}`
        );
        setEventType(et);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableSlots() {
    if (!selectedDate || !booking) return;
    setSlotsLoading(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const data = await apiFetch<AvailableSlot[]>(
        `/api/public/${booking.username}/${booking.event_slug}/slots?date=${dateStr}`
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

  async function handleReschedule(formData: BookingFormData) {
    if (!selectedDate || !selectedSlot || !booking) return;

    setBookingLoading(true);
    try {
      const selectedSlotObj = availableSlots.find(
        slot => format(new Date(slot.start), "h:mm a") === selectedSlot
      );
      if (!selectedSlotObj) throw new Error("Selected slot not found");

      await apiFetch(
        `/api/public/bookings/${bookingId}/reschedule?token=${token}`,
        {
          method: "POST",
          body: JSON.stringify({
            visitor_name: formData.name,
            visitor_email: formData.email,
            visitor_notes: formData.notes || null,
            visitor_phone: formData.phone || null,
            visitor_company: formData.company || null,
            visitor_reason: formData.reason || null,
            starts_at: selectedSlotObj.start,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }
      );
      setRescheduled(true);
    } catch (e: any) {
      alert(`Reschedule failed: ${e.message}`);
    } finally {
      setBookingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !booking || !token) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Booking Not Found</h1>
          <p className="text-muted-foreground mb-4">
            This booking doesn&apos;t exist or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  if (booking.status !== "confirmed") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Cannot Reschedule</h1>
          <p className="text-muted-foreground mb-4">
            This booking has already been cancelled or rescheduled.
          </p>
        </div>
      </div>
    );
  }

  if (rescheduled) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-green-200/30 rounded-full blur-3xl" />
        <div className="max-w-md w-full mx-4 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-8 text-center relative">
          <div className="w-16 h-16 bg-green-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-6">Rescheduled!</h2>
          <div className="space-y-1 mb-6">
            <p className="font-medium">{booking.event_type_name}</p>
            <p className="text-sm text-muted-foreground">
              {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-sm text-muted-foreground">{selectedSlot}</p>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            A new confirmation email has been sent to your email address.
          </p>
          <Link href={`/book/${booking.username}`}>
            <Button variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Profile
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden py-8">
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-200/15 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            <h1 className="text-3xl font-bold tracking-tight">Reschedule</h1>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>{booking.duration_minutes} minutes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>
                Currently: {format(new Date(booking.starts_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          </div>
          <p className="mt-2 text-muted-foreground">
            Pick a new time for your {booking.event_type_name} with{" "}
            {booking.username}.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-6">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Select a New Date</h3>
            <CalendarPicker
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
          </div>

          <div className="space-y-6">
            {selectedDate ? (
              <>
                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-6">
                  <h3 className="text-lg font-semibold tracking-tight mb-1">Available Times</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {format(selectedDate, "EEEE, MMMM d, yyyy")}
                  </p>
                  <TimeSlots
                    slots={availableSlots.map(slot => format(new Date(slot.start), "h:mm a"))}
                    selectedSlot={selectedSlot}
                    onSlotSelect={setSelectedSlot}
                    loading={slotsLoading}
                  />
                </div>

                {selectedSlot && (
                  <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-6">
                    <h3 className="text-lg font-semibold tracking-tight mb-4">Confirm Details</h3>
                    <BookingForm
                      onSubmit={handleReschedule}
                      loading={bookingLoading}
                      collectPhone={eventType?.collect_phone}
                      collectCompany={eventType?.collect_company}
                      collectReason={eventType?.collect_reason}
                      defaultValues={{
                        name: booking.visitor_name,
                        email: booking.visitor_email,
                        notes: booking.visitor_notes || "",
                        phone: booking.visitor_phone || "",
                        company: booking.visitor_company || "",
                        reason: booking.visitor_reason || "",
                      }}
                      submitLabel="Confirm Reschedule"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] py-12 text-center text-muted-foreground">
                Select a date to see available times
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
