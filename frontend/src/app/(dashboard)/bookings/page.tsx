"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { format, startOfWeek } from "date-fns";
import { CalEvent, ViewToggle, WeekCalendar, colorFor, useCalendarView } from "@/components/week-calendar";
import { ClockLoader } from "@/components/ui/clock-loader";
import { bookingPrice } from "@/lib/booking-payments";
import { Plus } from "lucide-react";
import { NewBookingDialog, nextHalfHour } from "@/components/bookings/new-booking-dialog";

interface Booking {
  price_cents: number | null;
  currency: string;
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
  guest_emails?: string[];
  rescheduled_from_id?: string | null;
  event_type_id: number;
}

interface CachedEvent {
  id: string;
  calendar_source_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  source_name: string | null;
}

const SYNCED = "synced-";

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
              {booking.guest_emails?.length ? `, ${booking.guest_emails.join(", ")}` : ""}
            </p>
            {booking.status === "pending_payment" && <p className="text-sm text-muted-foreground">Waiting for payment</p>}
            {booking.price_cents != null && <p className="text-sm">{bookingPrice(booking.price_cents, booking.currency)}</p>}
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
  const [newOpen, setNewOpen] = useState(false);
  const [newStart, setNewStart] = useState<Date>(() => nextHalfHour());
  const [newZone, setNewZone] = useState<string | undefined>(undefined);
  const [newMinutes, setNewMinutes] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [synced, setSynced] = useState<CachedEvent[]>([]);

  function openNewBooking(start: Date, zone?: string, minutes?: number) {
    setNewStart(start);
    setNewZone(zone);
    setNewMinutes(minutes);
    setNewOpen(true);
  }

  const onRangeChange = useCallback((start: Date, end: Date) => setRange({ start, end }), []);

  // Your calendars, faded behind the bookings, so clashes show before you click.
  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const q = `start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`;
        const evs = await apiFetch<CachedEvent[]>(`/api/calendars/cached-events?${q}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled) setSynced(evs);
      } catch {
        if (!cancelled) setSynced([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, getToken]);

  async function moveBooking(id: string, start: Date, allowConflict = false): Promise<void> {
    try {
      const token = await getToken();
      const moved = await apiFetch<Booking>(`/api/bookings/${id}/reschedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ starts_at: start.toISOString(), allow_conflict: allowConflict }),
      });
      toast({ title: "Moved", description: `${moved.visitor_name} got the updated invite.` });
      setSelectedId(String(moved.id));
      fetchBookings();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The booking didn't move. Try again.";
      if (!allowConflict && message.startsWith("This time overlaps") && confirm(`${message}. Move it anyway?`)) {
        return moveBooking(id, start, true);
      }
      toast({ title: "Not moved", description: message, variant: "destructive" });
    }
  }

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [confirmed, completed, cancelled, pending] = await Promise.all([
        apiFetch<Booking[]>("/api/bookings?status=confirmed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=completed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=cancelled", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=pending_payment", { headers }),
      ]);

      const now = new Date();
      const upcoming = [...confirmed, ...pending].filter(b => new Date(b.starts_at) >= now)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
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
    if (!confirm("Cancel this booking? Paid bookings receive a full refund.")) return;
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
  const selectedSynced = selectedId?.startsWith(SYNCED) ? synced.find((e) => SYNCED + e.id === selectedId) ?? null : null;
  const now = new Date();
  const replaced = new Set(allBookings.map((b) => b.rescheduled_from_id).filter(Boolean).map(String));

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
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => openNewBooking(nextHalfHour())}>
            <Plus className="mr-2 h-4 w-4" />
            New booking
          </Button>
        </div>
      </div>

      <NewBookingDialog open={newOpen} onOpenChange={setNewOpen} start={newStart} zone={newZone} duration={newMinutes} onCreated={fetchBookings} />

      {view === "calendar" ? (
        <div className="space-y-4">
          <WeekCalendar
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            events={[
              ...synced.map((e) => ({
                id: SYNCED + e.id,
                title: e.title || "Busy",
                start: new Date(e.starts_at),
                end: new Date(e.ends_at),
                allDay: e.is_all_day,
                color: "#94a3b8",
                label: e.source_name ?? undefined,
                faded: true,
              })),
              ...allBookings
                // A moved booking's earlier slot only clutters the grid.
                .filter((b) => !replaced.has(String(b.id)))
                .map((b) => ({
                  id: String(b.id),
                  title: b.visitor_name,
                  start: new Date(b.starts_at),
                  end: new Date(b.ends_at),
                  color: colorFor(String(b.event_type_id)),
                  label: b.status === "cancelled" ? "Cancelled" : b.status === "pending_payment" ? "Waiting for payment" : undefined,
                  faded: b.status === "cancelled",
                  movable: b.status === "confirmed" && new Date(b.starts_at) > now,
                })),
            ]}
            onSelect={(ev: CalEvent) => setSelectedId(ev.id)}
            onSlotClick={(start, zone, minutes) => openNewBooking(start < new Date() ? nextHalfHour() : start, zone, minutes)}
            onEventMove={(ev, start) => moveBooking(ev.id, start)}
            onRangeChange={onRangeChange}
            onNew={() => openNewBooking(nextHalfHour())}
            emptyHint="no bookings this week · click or drag to book one"
          />
          {selectedSynced && (
            <Card>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="font-semibold">{selectedSynced.title || "Busy"}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedSynced.is_all_day
                      ? `${format(new Date(selectedSynced.starts_at), "EEEE, MMMM d")} · all day`
                      : `${format(new Date(selectedSynced.starts_at), "EEEE, MMMM d · h:mm a")} – ${format(new Date(selectedSynced.ends_at), "h:mm a")}`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    From your calendar{selectedSynced.source_name ? ` · ${selectedSynced.source_name}` : ""}. It blocks this time on your booking page.
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
              </CardContent>
            </Card>
          )}
          {selectedBooking && (
            <BookingCard
              booking={selectedBooking}
              onCancel={
                ["confirmed", "pending_payment"].includes(selectedBooking.status) && new Date(selectedBooking.starts_at) >= new Date()
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
