"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      // Find the selected slot object to get the full ISO datetime
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !eventType) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Booking Confirmed!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div>
              <p className="font-medium mb-1">{eventType.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
              </p>
              <p className="text-sm text-muted-foreground">{selectedSlot}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              A confirmation email has been sent to your email address.
            </p>
            <Link href={`/book/${username}`}>
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <Link href={`/book/${username}`}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: eventType.color }}
            />
            <h1 className="text-3xl font-bold">{eventType.name}</h1>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{eventType.duration_minutes} minutes</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Book with {eventType.host_name || username}</span>
            </div>
          </div>
          {eventType.description && (
            <p className="mt-2 text-muted-foreground">{eventType.description}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Select a Date</CardTitle>
            </CardHeader>
            <CardContent>
              <CalendarPicker
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            {selectedDate ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Available Times</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {format(selectedDate, "EEEE, MMMM d, yyyy")}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <TimeSlots
                      slots={availableSlots.map(slot => format(new Date(slot.start), "h:mm a"))}
                      selectedSlot={selectedSlot}
                      onSlotSelect={setSelectedSlot}
                      loading={slotsLoading}
                    />
                  </CardContent>
                </Card>

                {selectedSlot && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Your Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <BookingForm
                        onSubmit={handleBooking}
                        loading={bookingLoading}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select a date to see available times
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
