"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
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

/** Monday first, matching day_of_week 0 to 6; names come from the UI language. */
const dayNames = (locale: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "long" }));

const timeSlots = (locale: string) => Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  return {
    value: `${String(hour).padStart(2, "0")}:${minute}:00`,
    label: new Date(2000, 0, 1, hour, Number(minute)).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
  };
});

export default function AvailabilityPage() {
  const t = useTranslations("availability");
  const tc = useTranslations("common");
  const locale = useLocale();
  const DAYS = useMemo(() => dayNames(locale), [locale]);
  const TIME_SLOTS = useMemo(() => timeSlots(locale), [locale]);
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
      setLoadError(t("loadFailed"));
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
      toast({ title: t("saved") });
    } catch (error: any) {
      toast({
        title: tc("error"),
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
        <ClockLoader size="lg" label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("weeklyHours")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadError && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-4 text-sm">
                <span>{loadError}</span>
                <Button size="sm" variant="outline" onClick={() => fetchAvailability()}>{tc("retry")}</Button>
              </div>
            )}
            {usingDefaults && <p className="text-sm text-muted-foreground">{t("defaultsHint")}</p>}
            {DAYS.map((day, index) => {
              const rule = availability.find((r) => r.day_of_week === index);
              if (!rule) return null;

              return (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-3 p-4 border rounded-lg"
                >
                  <div className="w-28">
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
                        <span className="text-muted-foreground">{t("to")}</span>
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
                {saving ? tc("saving") : t("save")}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("shareTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("shareHint")}</p>
            <ShareAvailability />
          </CardContent>
        </Card>
      </div>

      <AvailabilityWeek hours={availability} />
    </div>
  );
}
