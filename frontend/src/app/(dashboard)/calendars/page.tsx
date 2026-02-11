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
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface Calendar {
  id: number;
  name: string;
  type: string;
  ics_url: string | null;
  last_synced_at: string | null;
}

export default function CalendarsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", ics_url: "" });

  useEffect(() => {
    fetchCalendars();
  }, []);

  async function fetchCalendars() {
    try {
      const token = await getToken();
      const data = await apiFetch<Calendar[]>("/api/calendars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCalendars(data);
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
      fetchCalendars();
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
      fetchCalendars();
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
      fetchCalendars();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">Loading...</div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Calendar Connections</h1>
        <p className="text-muted-foreground mt-2">
          Connect calendars to check availability and prevent double bookings
        </p>
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
    </div>
  );
}
