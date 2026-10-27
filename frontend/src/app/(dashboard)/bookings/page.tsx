"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { format, startOfWeek } from "date-fns";
import { CalEvent, ViewToggle, WeekCalendar, colorFor, useCalendarView } from "@/components/week-calendar";
import { ClockLoader } from "@/components/ui/clock-loader";

interface Booking {
  id: number;
  visitor_name: string;
  visitor_email: string;
  starts_at: string;
  ends_at: string;
  status: string;
  visitor_notes: string | null;
  visitor_phone: string | null;
  visitor_company: string | null;
  visitor_url: string | null;
  event_type_id: number;
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel?: (id: number) => void }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">{booking.visitor_name}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {booking.visitor_email}
            </p>
            <p className="text-sm font-medium">
              {format(new Date(booking.starts_at), "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(booking.starts_at), "h:mm a")} -{" "}
              {format(new Date(booking.ends_at), "h:mm a")}
            </p>
            {booking.visitor_phone && (
              <p className="text-sm mt-1 text-muted-foreground">
                Phone: {booking.visitor_phone}
              </p>
            )}
            {booking.visitor_company && (
              <p className="text-sm mt-1 text-muted-foreground">
                Company: {booking.visitor_company}
              </p>
            )}
            {booking.visitor_url && (
              <p className="text-sm mt-1 text-muted-foreground">
                URL: <a href={booking.visitor_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{booking.visitor_url}</a>
              </p>
            )}
            {booking.visitor_notes && (
              <p className="text-sm mt-1 text-muted-foreground">
                Note: {booking.visitor_notes}
              </p>
            )}
          </div>
          {onCancel && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onCancel(booking.id)}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BookingsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [cancelledBookings, setCancelledBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useCalendarView("bookings");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [confirmed, completed, cancelled] = await Promise.all([
        apiFetch<Booking[]>("/api/bookings?status=confirmed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=completed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=cancelled", { headers }),
      ]);

      const now = new Date();
      const upcoming = confirmed.filter(b => new Date(b.starts_at) >= now);
      const pastConfirmed = confirmed.filter(b => new Date(b.starts_at) < now).reverse();

      setUpcomingBookings(upcoming);
      setPastBookings([...pastConfirmed, ...completed]);
      setCancelledBookings(cancelled);
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: number) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: "Booking cancelled" });
      fetchBookings();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }


  const allBookings = [...upcomingBookings, ...pastBookings, ...cancelledBookings];
  const selectedBooking = allBookings.find((b) => String(b.id) === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading bookings" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-2">
            View and manage your scheduled meetings
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "calendar" ? (
        <div className="space-y-4">
          <WeekCalendar
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            events={allBookings.map((b) => ({
              id: String(b.id),
              title: b.visitor_name,
              start: new Date(b.starts_at),
              end: new Date(b.ends_at),
              color: colorFor(String(b.event_type_id)),
              label: b.status === "cancelled" ? "Cancelled" : undefined,
              faded: b.status === "cancelled",
            }))}
            onSelect={(ev: CalEvent) => setSelectedId(ev.id)}
            emptyHint="no bookings this week"
          />
          {selectedBooking && (
            <BookingCard
              booking={selectedBooking}
              onCancel={
                selectedBooking.status === "confirmed" && new Date(selectedBooking.starts_at) >= new Date()
                  ? handleCancel
                  : undefined
              }
            />
          )}
        </div>
      ) : (
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="past">Past ({pastBookings.length})</TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4 mt-6">
          {upcomingBookings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No upcoming bookings
              </CardContent>
            </Card>
          ) : (
            upcomingBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onCancel={handleCancel} />
            ))
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4 mt-6">
          {pastBookings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No past bookings
              </CardContent>
            </Card>
          ) : (
            pastBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="space-y-4 mt-6">
          {cancelledBookings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No cancelled bookings
              </CardContent>
            </Card>
          ) : (
            cancelledBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))
          )}
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
