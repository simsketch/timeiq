"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { addDays, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClockLoader } from "@/components/ui/clock-loader";
import { WeekCalendar, WeeklyHours, CalEvent, colorFor } from "@/components/week-calendar";
import { apiFetch } from "@/lib/api";
import { calendarDate, calendarInstant } from "@/lib/calendar-time";

interface CachedEvent {
  id: string;
  calendar_source_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  source_name: string | null;
}

export function AvailabilityWeek({ hours }: { hours: WeeklyHours[] }) {
  const t = useTranslations("availability.week");
  const tc = useTranslations("common");
  const { getToken } = useAuth();
  const [context, setContext] = useState<{ timezone: string; hasCalendars: boolean } | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [week, setWeek] = useState<{ start: number; events: CalEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [me, calendars] = await Promise.all([
          apiFetch<{ timezone: string }>("/api/me", { headers }),
          apiFetch<unknown[]>("/api/calendars", { headers }),
        ]);
        if (cancelled) return;
        setWeekStart(startOfWeek(calendarDate(new Date(), me.timezone), { weekStartsOn: 1 }));
        setContext({ timezone: me.timezone, hasCalendars: calendars.length > 0 });
        setError(null);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : t("previewFailed"));
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, attempt, t]);

  useEffect(() => {
    if (!context) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const start = calendarInstant(weekStart, context.timezone).toISOString();
        const end = calendarInstant(addDays(weekStart, 7), context.timezone).toISOString();
        const range = new URLSearchParams({ start, end });
        const events = await apiFetch<CachedEvent[]>(`/api/calendars/cached-events?${range}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        setWeek({ start: weekStart.getTime(), events: events.map((event) => ({
          id: event.id,
          title: event.title || t("busy"),
          start: new Date(event.starts_at),
          end: new Date(event.ends_at),
          allDay: event.is_all_day,
          color: colorFor(event.calendar_source_id),
          label: event.source_name ?? undefined,
        })) });
        setError(null);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : t("busyFailed"));
      }
    })();
    return () => { cancelled = true; };
  }, [context, weekStart, getToken, t]);

  const loading = !context || week?.start !== weekStart.getTime();
  const hasHours = hours.some((rule) => rule.is_active && rule.end_time > rule.start_time);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("intro")}
          {context && ` ${t("timesIn", { zone: context.timezone.replace(/_/g, " ") })}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasHours && <p className="text-sm text-muted-foreground">{t("noHours")}</p>}
        {context && !context.hasCalendars && <p className="text-sm text-muted-foreground">{t.rich("connect", { link: (chunks) => <Link href="/calendars" className="underline underline-offset-4">{chunks}</Link> })}</p>}
        {error ? (
          <div role="alert" className="space-y-3 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>{tc("retry")}</Button>
            {" "}<Link href="/calendars" className="underline underline-offset-4">{t("checkConnections")}</Link>
          </div>
        ) : loading ? <ClockLoader label={t("loading")} /> : (
          <>
            {context.hasCalendars && !week?.events.length && <p className="text-sm text-muted-foreground">{t.rich("noEvents", { link: (chunks) => <Link href="/calendars" className="underline underline-offset-4">{chunks}</Link> })}</p>}
            <WeekCalendar weekStart={weekStart} onWeekChange={setWeekStart} events={week?.events ?? []} availableHours={hours} timezone={context.timezone} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
