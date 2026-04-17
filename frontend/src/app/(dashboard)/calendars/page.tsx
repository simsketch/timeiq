"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { Plus, Trash2, RefreshCw, CalendarDays, Clock } from "lucide-react";
import { format } from "date-fns";

interface Calendar {
  id: number;
  name: string;
  type: string;
  ics_url: string | null;
  last_synced_at: string | null;
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
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", ics_url: "" });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
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
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: number) {
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

  async function handleSync(id: number) {
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: "Calendar synced successfully" });
      fetchAll();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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
      <div className="flex items-center justify-center h-64">Loading...</div>
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
                <Label htmlFor="ics_url">ICS URL</Label>
                <Input
                  id="ics_url"
                  type="url"
                  value={formData.ics_url}
                  onChange={(e) =>
                    setFormData({ ...formData, ics_url: e.target.value })
                  }
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Add Calendar</Button>
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
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{calendar.name}</h3>
                      <Badge variant="secondary">
                        {calendar.type.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {calendar.last_synced_at
                        ? `Last synced: ${format(
                            new Date(calendar.last_synced_at),
                            "MMM d, yyyy h:mm a"
                          )}`
                        : "Never synced"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(calendar.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(calendar.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Cached Events Debug View */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Synced Events</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Events from your connected calendars that block availability (next 14 days)
          </p>
        </div>
        {cachedEvents.length === 0 ? (
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
