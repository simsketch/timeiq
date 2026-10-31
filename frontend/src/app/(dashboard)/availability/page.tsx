"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { AvailabilityWeek } from "@/components/availability-week";
import { ShareAvailability } from "@/components/share-availability";
import { ClockLoader } from "@/components/ui/clock-loader";

interface AvailabilityRule {
  id?: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const period = hour < 12 ? "AM" : "PM";
  return {
    value: `${String(hour).padStart(2, "0")}:${minute}:00`,
    label: `${displayHour}:${minute} ${period}`,
  };
});

export default function AvailabilityPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [availability, setAvailability] = useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usingDefaults, setUsingDefaults] = useState(false);
  // Saving replaces every rule, so it stays off until the saved ones loaded.
  const [loadError, setLoadError] = useState<string | null>(null);

  async function fetchAvailability() {
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const data = await apiFetch<AvailabilityRule[]>("/api/availability-rules", {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Initialize with default availability if empty
      setUsingDefaults(data.length === 0);
      if (data.length === 0) {
        const defaultAvailability: AvailabilityRule[] = DAYS.map((_, index) => ({
          day_of_week: index,
          start_time: "09:00:00",
          end_time: "17:00:00",
          is_active: index < 5, // Monday-Friday enabled by default
        }));
        setAvailability(defaultAvailability);
      } else {
        setAvailability(data);
      }
    } catch (error) {
      console.error("Failed to fetch availability:", error);
      setLoadError("We couldn't load your weekly hours, so they can't be edited right now.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      await apiFetch("/api/availability-rules", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rules: availability }),
      });
      setUsingDefaults(false);
      toast({ title: "Availability updated successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateDay(dayIndex: number, updates: Partial<AvailabilityRule>) {
    setAvailability((prev) =>
      prev.map((rule) =>
        rule.day_of_week === dayIndex ? { ...rule, ...updates } : rule
      )
    );
  }

  useEffect(() => {
    // Every setState in these fetches runs after their first await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAvailability();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading availability" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Availability</h1>
        <p className="text-muted-foreground mt-2">
          Set your weekly working hours
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadError && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-4 text-sm">
                <span>{loadError}</span>
                <Button size="sm" variant="outline" onClick={() => fetchAvailability()}>Try again</Button>
              </div>
            )}
            {usingDefaults && <p className="text-sm text-muted-foreground">No weekly hours saved yet. These default hours are a starting point. Adjust them and save your availability.</p>}
            {DAYS.map((day, index) => {
              const rule = availability.find((r) => r.day_of_week === index);
              if (!rule) return null;

              return (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-3 p-4 border rounded-lg"
                >
                  <div className="w-24">
                    <Label className="font-medium">{day}</Label>
                  </div>
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) =>
                      updateDay(index, { is_active: checked })
                    }
                  />
                  {rule.is_active && (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={rule.start_time}
                          onValueChange={(value) =>
                            updateDay(index, { start_time: value })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((slot) => (
                              <SelectItem key={slot.value} value={slot.value}>
                                {slot.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">to</span>
                        <Select
                          value={rule.end_time}
                          onValueChange={(value) =>
                            updateDay(index, { end_time: value })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((slot) => (
                              <SelectItem key={slot.value} value={slot.value}>
                                {slot.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <div className="pt-4">
              <Button onClick={handleSave} disabled={saving || loadError !== null}>
                {saving ? "Saving..." : "Save availability"}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Share availability</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Copy your open times as text or an image to share with anyone. Save your weekly hours first to include your changes.</p>
            <ShareAvailability />
          </CardContent>
        </Card>
      </div>

      <AvailabilityWeek hours={availability} />
    </div>
  );
}
