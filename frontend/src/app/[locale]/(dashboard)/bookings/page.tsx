"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
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

function BookingCard({
  booking,
  onCancel,
  onMove,
}: {
  booking: Booking;
  onCancel?: (id: number) => void;
  onMove?: (id: string, start: Date) => Promise<void>;
}) {
  const t = useTranslations("bookings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [when, setWhen] = useState(() => format(new Date(booking.starts_at), "yyyy-MM-dd'T'HH:mm"));
  const [saving, setSaving] = useState(false);
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
            {booking.status === "pending_payment" && <p className="text-sm text-muted-foreground">{t("waitingForPayment")}</p>}
            {booking.price_cents != null && <p className="text-sm">{bookingPrice(booking.price_cents, booking.currency, locale)}</p>}
            <p className="text-sm font-medium">
              {new Date(booking.starts_at).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("timeRange", {
                start: new Date(booking.starts_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
                end: new Date(booking.ends_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
              })}
            </p>
            {booking.visitor_phone && (
              <p className="text-sm mt-1 text-muted-foreground">
                {t("phone", { value: booking.visitor_phone })}
              </p>
            )}
            {booking.visitor_company && (
              <p className="text-sm mt-1 text-muted-foreground">
                {t("company", { value: booking.visitor_company })}
              </p>
            )}
            {booking.visitor_url && (
              <p className="text-sm mt-1 text-muted-foreground">
                {t("url")} <a href={booking.visitor_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{booking.visitor_url}</a>
              </p>
            )}
            {booking.visitor_notes && (
              <p className="text-sm mt-1 text-muted-foreground">
                {t("note", { value: booking.visitor_notes })}
              </p>
            )}
            {onMove && (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  await onMove(String(booking.id), new Date(when));
                  setSaving(false);
                }}
              >
                <label className="text-sm text-muted-foreground" htmlFor={`when-${booking.id}`}>{t("changeTime")}</label>
                <input
                  id={`when-${booking.id}`}
                  type="datetime-local"
                  required
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="rounded-md border px-2 py-1 text-sm"
                />
                <Button size="sm" type="submit" disabled={saving || new Date(when).getTime() === new Date(booking.starts_at).getTime()}>
                  {saving ? tc("saving") : tc("save")}
                </Button>
              </form>
            )}
          </div>
          {onCancel && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onCancel(booking.id)}
            >
              {tc("cancel")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BookingsPage() {
  const t = useTranslations("bookings");
  const tc = useTranslations("common");
  const locale = useLocale();
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
  const [sources, setSources] = useState<{ id: string; name: string; is_active: boolean }[]>([]);

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
      toast({ title: t("moved"), description: t("movedBody", { name: moved.visitor_name }) });
      setSelectedId(String(moved.id));
      fetchBookings();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("moveFailed");
      // The API's overlap message is English; match it before showing the localized question.
      if (!allowConflict && message.startsWith("This time overlaps") && confirm(t("moveAnyway", { message }))) {
        return moveBooking(id, start, true);
      }
      toast({ title: t("notMoved"), description: message, variant: "destructive" });
    }
  }

  useEffect(() => {
    fetchBookings();
    const linked = new URLSearchParams(window.location.search).get("booking");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (linked) setSelectedId(linked);
  }, []);

  async function fetchBookings() {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [confirmed, completed, cancelled, pending, calendarList] = await Promise.all([
        apiFetch<Booking[]>("/api/bookings?status=confirmed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=completed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=cancelled", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=pending_payment", { headers }),
        apiFetch<{ id: string; name: string; is_active: boolean }[]>("/api/calendars", { headers }).catch(() => []),
      ]);
      setSources(calendarList.filter((c) => c.is_active));

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
    if (!confirm(t("confirmCancel"))) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: t("cancelled") });
      fetchBookings();
    } catch (error: any) {
      toast({
        title: tc("error"),
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
        <ClockLoader size="lg" label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => openNewBooking(nextHalfHour())}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newBooking")}
          </Button>
        </div>
      </div>

      <NewBookingDialog open={newOpen} onOpenChange={setNewOpen} start={newStart} zone={newZone} duration={newMinutes} onCreated={fetchBookings} />

      {selectedBooking && (
        <BookingCard
          key={`${selectedBooking.id}-${selectedBooking.starts_at}`}
          booking={selectedBooking}
          onCancel={
            ["confirmed", "pending_payment"].includes(selectedBooking.status) && new Date(selectedBooking.starts_at) >= new Date()
              ? handleCancel
              : undefined
          }
          onMove={selectedBooking.status === "confirmed" && new Date(selectedBooking.starts_at) > new Date() ? moveBooking : undefined}
        />
      )}
      {view === "calendar" ? (
        <div className="space-y-4">
          <WeekCalendar
            calendars={[
              { id: "bookings", name: t("timeiqBookings"), color: "hsl(var(--aurora-1))" },
              ...sources.map((c) => ({ id: c.id, name: c.name, color: colorFor(c.id) })),
            ]}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            events={[
              ...synced.map((e) => ({
                id: SYNCED + e.id,
                title: e.title || t("busy"),
                start: new Date(e.starts_at),
                end: new Date(e.ends_at),
                allDay: e.is_all_day,
                color: colorFor(e.calendar_source_id),
                label: e.source_name ?? undefined,
                faded: true,
                calendarId: e.calendar_source_id,
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
                  label: b.status === "cancelled" ? t("cancelledLabel") : b.status === "pending_payment" ? t("waitingForPayment") : undefined,
                  faded: b.status === "cancelled",
                  movable: b.status === "confirmed" && new Date(b.starts_at) > now,
                  calendarId: "bookings",
                  details: [b.visitor_email, ...(b.visitor_notes ? [t("note", { value: b.visitor_notes })] : [])],
                })),
            ]}
            onSelect={(ev: CalEvent) => setSelectedId(ev.id)}
            onSlotClick={(start, zone, minutes) => openNewBooking(start < new Date() ? nextHalfHour() : start, zone, minutes)}
            onEventMove={(ev, start) => moveBooking(ev.id, start)}
            onRangeChange={onRangeChange}
            onNew={() => openNewBooking(nextHalfHour())}
            emptyHint={t("emptyWeek")}
          />
          {selectedSynced && (
            <Card>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="font-semibold">{selectedSynced.title || t("busy")}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedSynced.is_all_day
                      ? t("allDayOn", { day: new Date(selectedSynced.starts_at).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }) })
                      : t("timeRangeOn", {
                          day: new Date(selectedSynced.starts_at).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }),
                          start: new Date(selectedSynced.starts_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
                          end: new Date(selectedSynced.ends_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
                        })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedSynced.source_name ? t("fromCalendarNamed", { name: selectedSynced.source_name }) : t("fromCalendar")}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>{tc("close")}</Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            {t("tabUpcoming", { count: upcomingBookings.length })}
          </TabsTrigger>
          <TabsTrigger value="past">{t("tabPast", { count: pastBookings.length })}</TabsTrigger>
          <TabsTrigger value="cancelled">
            {t("tabCancelled", { count: cancelledBookings.length })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4 mt-6">
          {upcomingBookings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t("noUpcoming")}
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
                {t("noPast")}
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
                {t("noCancelled")}
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
