"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarPicker } from "@/components/booking/calendar-picker";
import { TimeSlots } from "@/components/booking/time-slots";
import { BookingForm } from "@/components/booking/booking-form";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { Calendar, Clock, CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  color: string;
  buffer_minutes: number;
  host_name: string | null;
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

  async function handleBooking(formData: {
    name: string;
    email: string;
    notes: string;
  }) {
    if (!selectedDate || !selectedSlot) return;

    setBookingLoading(true);
    try {
      const selectedSlotObj = availableSlots.find(
        slot => format(new Date(slot.start), "h:mm a") === selectedSlot
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
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !eventType) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Type Not Found</h1>
          <p className="text-muted-foreground mb-4">
            This event type doesn&apos;t exist or is not available.
          </p>
          <Link href={`/book/${username}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Profile
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (bookingConfirmed) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-green-200/30 rounded-full blur-3xl" />
        <div className="max-w-md w-full mx-4 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-8 text-center relative">
          <div className="w-16 h-16 bg-green-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-6">Booking Confirmed!</h2>
          <div className="space-y-1 mb-6">
            <p className="font-medium">{eventType.name}</p>
            <p className="text-sm text-muted-foreground">
              {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-sm text-muted-foreground">{selectedSlot}</p>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            A confirmation email has been sent to your email address.
          </p>
          <Link href={`/book/${username}`}>
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
      {/* Subtle mesh background */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-200/15 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 max-w-5xl">
        <Link href={`/book/${username}`}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-3 h-3 rounded-full ring-4 ring-white/50"
              style={{ backgroundColor: eventType.color }}
            />
            <h1 className="text-3xl font-bold tracking-tight">{eventType.name}</h1>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>{eventType.duration_minutes} minutes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>Book with {eventType.host_name || username}</span>
            </div>
          </div>
          {eventType.description && (
            <p className="mt-2 text-muted-foreground">{eventType.description}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-6">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Select a Date</h3>
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
                    <h3 className="text-lg font-semibold tracking-tight mb-4">Your Information</h3>
                    <BookingForm
                      onSubmit={handleBooking}
                      loading={bookingLoading}
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
