"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { EmailSchedules } from "@/components/email-schedules";
import { apiFetch } from "@/lib/api";
import { Plus, Trash2, RefreshCw, CalendarDays, Clock, AlertTriangle, Link2 } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";
import { CalEvent, ViewToggle, WeekCalendar, colorFor, useCalendarView } from "@/components/week-calendar";
import { ClockLoader } from "@/components/ui/clock-loader";

interface Calendar {
  id: string;
  name: string;
  type: string;
  ics_url: string | null;
  last_synced_at: string | null;
  sync_status: "ok" | "failing" | "broken";
  last_sync_error: string | null;
  failing_since: string | null;
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

export default function CalendarsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [cachedEvents, setCachedEvents] = useState<CachedEvent[]>([]);
  const [view, setView] = useCalendarView("calendars");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekEvents, setWeekEvents] = useState<CachedEvent[]>([]);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [weekVersion, setWeekVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const range = `start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(addDays(weekStart, 7).toISOString())}`;
        const evs = await apiFetch<CachedEvent[]>(`/api/calendars/cached-events?${range}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setWeekEvents(evs);
      } catch {
        if (!cancelled) setWeekEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart, weekVersion, getToken]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", ics_url: "" });
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [newLink, setNewLink] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  // Google sign-in needs OAuth credentials on the server; hide it until they exist.
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    apiFetch<{ enabled: boolean }>("/api/google/status")
      .then((s) => setGoogleEnabled(s.enabled))
      .catch(() => setGoogleEnabled(false));
  }, []);

  useEffect(() => {
    fetchAll();
    // Google's OAuth callback lands back here with ?google=connected.
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast({
        title: "Google Calendar connected",
        description: "Its events now block times on your booking page.",
      });
      params.delete("google");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }, []);

  async function handleConnectGoogle() {
    setConnectingGoogle(true);
    try {
      const token = await getToken();
      // credentials: "include" keeps the state cookie the OAuth callback checks.
      const { url } = await apiFetch<{ url: string }>("/api/google/auth-url", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: "Couldn't start Google sign-in",
        description: error.message,
        variant: "destructive",
      });
      setConnectingGoogle(false);
    }
  }

  async function fetchAll() {
    setWeekVersion((v) => v + 1);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [cals, events] = await Promise.all([
        apiFetch<Calendar[]>("/api/calendars", { headers }),
        apiFetch<CachedEvent[]>("/api/calendars/cached-events?days=14", { headers }),
      ]);
      setCalendars(cals);
      setCachedEvents(events);
    } catch (error) {
      console.error("Failed to fetch calendars:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCalendar(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const token = await getToken();
      await apiFetch("/api/calendars/ics", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      toast({ title: "Calendar added successfully" });
      setFormData({ name: "", ics_url: "" });
      setShowAddForm(false);
      fetchAll();
    } catch (error: any) {
      toast({
        title: "Couldn't add that calendar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleReplaceLink(e: React.FormEvent, id: string) {
    e.preventDefault();
    setSavingLink(true);
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ics_url: newLink }),
      });
      toast({ title: "Link replaced", description: "The calendar is syncing again." });
      setReplacing(null);
      setNewLink("");
      fetchAll();
    } catch (error: any) {
      toast({ title: "That link didn't work", description: error.message, variant: "destructive" });
    } finally {
      setSavingLink(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this calendar?")) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: "Calendar removed" });
      fetchAll();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleSync(id: string) {
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: "Calendar synced successfully" });
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    }
    fetchAll();
  }

  const [syncingAll, setSyncingAll] = useState(false);

  async function handleSyncAll() {
    setSyncingAll(true);
    try {
      const token = await getToken();
      const result = await apiFetch<{ synced: number; failed: number }>(
        "/api/calendars/sync-all",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast({
        title: "Sync complete",
        description: `${result.synced} calendar${result.synced !== 1 ? "s" : ""} synced${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
      });
      fetchAll();
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading calendars" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar Connections</h1>
          <p className="text-muted-foreground mt-2">
            Connect calendars to check availability and prevent double bookings
          </p>
        </div>
        {calendars.length > 0 && (
          <Button
            variant="outline"
            onClick={handleSyncAll}
            disabled={syncingAll}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncingAll ? "animate-spin" : ""}`} />
            {syncingAll ? "Syncing..." : "Sync All"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Add Calendar</CardTitle>
            <div className="flex flex-wrap justify-end gap-2">
{googleEnabled && (
                            <Button size="sm" onClick={handleConnectGoogle} disabled={connectingGoogle}>
                <CalendarDays className="h-4 w-4 mr-2" />
                {connectingGoogle ? "Opening Google..." : "Connect Google Calendar"}
              </Button>
              )}
              {!showAddForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add ICS Calendar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showAddForm && (
            <form onSubmit={handleAddCalendar} className="space-y-4">
              <div>
                <Label htmlFor="name">Calendar Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="My Calendar"
                  required
                />
              </div>
              <div>
                <Label htmlFor="ics_url">Calendar link (ICS or webcal)</Label>
                <Input
                  id="ics_url"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  value={formData.ics_url}
                  onChange={(e) =>
                    setFormData({ ...formData, ics_url: e.target.value })
                  }
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={adding}>
                  {adding ? "Checking link..." : "Add Calendar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ name: "", ics_url: "" });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <EmailSchedules onChange={fetchAll} />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Connected Calendars</h2>
        {calendars.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No calendars connected yet
            </CardContent>
          </Card>
        ) : (
          calendars.map((calendar) => (
            <Card key={calendar.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold">{calendar.name}</h3>
                      <Badge variant="secondary">
                        {calendar.type === "ics_url" ? "ICS" : calendar.type === "email" ? "Emailed schedules" : calendar.type === "meetings" ? "Group meetings" : calendar.type.toUpperCase()}
                      </Badge>
                      {calendar.sync_status === "broken" && (
                        <Badge variant="destructive">Not syncing</Badge>
                      )}
                      {calendar.sync_status === "failing" && (
                        <Badge variant="outline" className="border-amber-400 text-amber-800">Retrying</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {calendar.last_synced_at
                        ? `Last synced: ${format(
                            new Date(calendar.last_synced_at),
                            "MMM d, yyyy h:mm a"
                          )}`
                        : "Never synced"}
                    </p>
                    {calendar.sync_status !== "ok" && calendar.last_sync_error && (
                      <p className="text-sm mt-2 flex items-start gap-2 text-red-700">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                          {calendar.last_sync_error}
                          {calendar.sync_status === "broken" &&
                            " New events on this calendar aren't blocking your booking page."}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {calendar.type === "google" && calendar.sync_status !== "ok" && (
                      <Button
                        size="sm"
                        variant={calendar.sync_status === "broken" ? "default" : "outline"}
                        onClick={handleConnectGoogle}
                        disabled={connectingGoogle}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reconnect
                      </Button>
                    )}
                    {calendar.type === "ics_url" && (
                      <Button
                        size="sm"
                        variant={calendar.sync_status === "broken" ? "default" : "outline"}
                        onClick={() => {
                          setReplacing(replacing === calendar.id ? null : calendar.id);
                          setNewLink("");
                        }}
                        aria-label="Replace link"
                      >
                        <Link2 className="h-4 w-4" />
                        {calendar.sync_status === "broken" && <span className="ml-2">Replace link</span>}
                      </Button>
                    )}
                    {calendar.type !== "email" && calendar.type !== "meetings" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSync(calendar.id)}
                        aria-label="Sync now"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(calendar.id)}
                      aria-label="Remove calendar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {replacing === calendar.id && (
                  <form onSubmit={(e) => handleReplaceLink(e, calendar.id)} className="mt-4 flex gap-2">
                    <Input
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      placeholder="Paste the new ICS or webcal link"
                      required
                      autoFocus
                    />
                    <Button type="submit" disabled={savingLink}>
                      {savingLink ? "Checking..." : "Save"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Synced events: week calendar by default, list as an option */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Synced Events</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Events from your connected calendars that block availability
              {view === "list" ? " (next 14 days)" : ""}
            </p>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>
        {view === "calendar" ? (
          <>
            <WeekCalendar
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              events={weekEvents.map((e) => ({
                id: e.id,
                title: e.title || "(No title)",
                start: new Date(e.starts_at),
                end: new Date(e.ends_at),
                allDay: e.is_all_day,
                color: colorFor(e.calendar_source_id),
                label: e.source_name ?? undefined,
              }))}
              onSelect={setSelected}
              emptyHint="no synced events this week"
            />
            {selected && (
              <Card>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">{selected.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {selected.allDay
                        ? `${format(selected.start, "EEEE, MMMM d")} · all day`
                        : `${format(selected.start, "EEEE, MMMM d · h:mm a")} – ${format(selected.end, "h:mm a")}`}
                    </p>
                    {selected.label && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: selected.color }} />
                        {selected.label}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
                </CardContent>
              </Card>
            )}
          </>
        ) : cachedEvents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              No cached events found. Sync your calendars to import events.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-2">
              <div className="divide-y">
                {cachedEvents.map((event) => {
                  const start = new Date(event.starts_at);
                  const end = new Date(event.ends_at);
                  return (
                    <div key={event.id} className="flex items-start justify-between py-3 gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {event.title || "(No title)"}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-muted-foreground">
                            {format(start, "EEE, MMM d")}
                          </span>
                          {event.is_all_day ? (
                            <Badge variant="secondary" className="text-xs">All day</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(start, "h:mm a")} – {format(end, "h:mm a")}
                            </span>
                          )}
                        </div>
                      </div>
                      {event.source_name && (
                        <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                          {event.source_name}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
