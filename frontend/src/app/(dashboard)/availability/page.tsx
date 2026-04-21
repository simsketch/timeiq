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

  useEffect(() => {
    fetchAvailability();
  }, []);

  async function fetchAvailability() {
    try {
      const token = await getToken();
      const data = await apiFetch<AvailabilityRule[]>("/api/availability-rules", {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Initialize with default availability if empty
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
      // Set defaults on error
      const defaultAvailability: AvailabilityRule[] = DAYS.map((_, index) => ({
        day_of_week: index,
        start_time: "09:00:00",
        end_time: "17:00:00",
        is_active: index < 5,
      }));
      setAvailability(defaultAvailability);
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

      <Card>
        <CardHeader>
          <CardTitle>Weekly Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {DAYS.map((day, index) => {
            const rule = availability.find((r) => r.day_of_week === index);
            if (!rule) return null;

            return (
              <div
                key={index}
                className="flex items-center gap-4 p-4 border rounded-lg"
              >
                <div className="w-32">
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
                    <div className="flex items-center gap-2">
                      <Select
                        value={rule.start_time}
                        onValueChange={(value) =>
                          updateDay(index, { start_time: value })
                        }
                      >
                        <SelectTrigger className="w-32">
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
                        <SelectTrigger className="w-32">
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Availability"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
