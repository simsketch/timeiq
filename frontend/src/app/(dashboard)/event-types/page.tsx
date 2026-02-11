"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { Plus, Copy, Edit, Trash2 } from "lucide-react";

interface EventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  color: string;
  is_active: boolean;
  buffer_minutes: number;
  max_bookings_per_day: number | null;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90];
const COLOR_OPTIONS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"
];

export default function EventTypesPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    duration_minutes: 30,
    description: "",
    color: COLOR_OPTIONS[0],
    buffer_minutes: 0,
    max_bookings_per_day: "",
  });

  useEffect(() => {
    fetchEventTypes();
  }, []);

  async function fetchEventTypes() {
    try {
      const token = await getToken();
      const data = await apiFetch<EventType[]>("/api/event-types", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEventTypes(data);
    } catch (error) {
      console.error("Failed to fetch event types:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = await getToken();
      const payload = {
        ...formData,
        max_bookings_per_day: formData.max_bookings_per_day ? parseInt(formData.max_bookings_per_day) : null,
      };

      if (editingId) {
        await apiFetch(`/api/event-types/${editingId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        toast({ title: "Event type updated successfully" });
      } else {
        await apiFetch("/api/event-types", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        toast({ title: "Event type created successfully" });
      }

      setDialogOpen(false);
      resetForm();
      fetchEventTypes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  async function toggleActive(id: number, isActive: boolean) {
    try {
      const token = await getToken();
      await apiFetch(`/api/event-types/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !isActive }),
      });
      fetchEventTypes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this event type?")) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/event-types/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: "Event type deleted" });
      fetchEventTypes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  function handleEdit(eventType: EventType) {
    setEditingId(eventType.id);
    setFormData({
      name: eventType.name,
      duration_minutes: eventType.duration_minutes,
      description: eventType.description || "",
      color: eventType.color,
      buffer_minutes: eventType.buffer_minutes,
      max_bookings_per_day: eventType.max_bookings_per_day?.toString() || "",
    });
    setDialogOpen(true);
  }

  function resetForm() {
    setEditingId(null);
    setFormData({
      name: "",
      duration_minutes: 30,
      description: "",
      color: COLOR_OPTIONS[0],
      buffer_minutes: 0,
      max_bookings_per_day: "",
    });
  }

  function copyBookingLink(slug: string) {
    const username = user?.username || user?.id;
    const link = `${window.location.origin}/book/${username}/${slug}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied to clipboard" });
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Event Types</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage your booking event types
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Event Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit" : "Create"} Event Type</DialogTitle>
                <DialogDescription>
                  Set up a new type of meeting that people can book with you.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Event Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="30 Minute Meeting"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Duration</Label>
                  <Select
                    value={formData.duration_minutes.toString()}
                    onValueChange={(value) => setFormData({ ...formData, duration_minutes: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((dur) => (
                        <SelectItem key={dur} value={dur.toString()}>
                          {dur} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this meeting type"
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-2">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="w-8 h-8 rounded-full border-2"
                        style={{
                          backgroundColor: color,
                          borderColor: formData.color === color ? "#000" : "transparent",
                        }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="buffer">Buffer Time (minutes)</Label>
                  <Input
                    id="buffer"
                    type="number"
                    value={formData.buffer_minutes}
                    onChange={(e) => setFormData({ ...formData, buffer_minutes: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="maxBookings">Max Bookings Per Day</Label>
                  <Input
                    id="maxBookings"
                    type="number"
                    value={formData.max_bookings_per_day}
                    onChange={(e) => setFormData({ ...formData, max_bookings_per_day: e.target.value })}
                    placeholder="Leave empty for unlimited"
                    min="1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingId ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {eventTypes.map((eventType) => (
          <Card key={eventType.id} className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full ring-4 ring-white/50"
                    style={{ backgroundColor: eventType.color }}
                  />
                  <CardTitle className="text-lg">{eventType.name}</CardTitle>
                </div>
                <Switch
                  checked={eventType.is_active}
                  onCheckedChange={() => toggleActive(eventType.id, eventType.is_active)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {eventType.duration_minutes} minutes
              </p>
              {eventType.description && (
                <p className="text-sm mb-4">{eventType.description}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyBookingLink(eventType.slug)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(eventType)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(eventType.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {eventTypes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No event types yet. Create your first one!</p>
        </div>
      )}
    </div>
  );
}
