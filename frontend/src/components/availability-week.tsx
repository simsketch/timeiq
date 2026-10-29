"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
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
        if (!cancelled) setError(error instanceof Error ? error.message : "The week preview did not load. Try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, attempt]);

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
          title: event.title || "Busy",
          start: new Date(event.starts_at),
          end: new Date(event.ends_at),
          allDay: event.is_all_day,
          color: colorFor(event.calendar_source_id),
          label: event.source_name ?? undefined,
        })) });
        setError(null);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Busy times did not load. Try again or sync your calendars.");
      }
    })();
    return () => { cancelled = true; };
  }, [context, weekStart, getToken]);

  const loading = !context || week?.start !== weekStart.getTime();
  const hasHours = hours.some((rule) => rule.is_active && rule.end_time > rule.start_time);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your week</CardTitle>
        <p className="text-sm text-muted-foreground">
          Green blocks show your weekly hours, including unsaved edits. Busy events block those times.
          {context && ` Times are in ${context.timezone.replace(/_/g, " ")}.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasHours && <p className="text-sm text-muted-foreground">No hours set. Turn on a day and choose its hours above to see available blocks.</p>}
        {context && !context.hasCalendars && <p className="text-sm text-muted-foreground"><Link href="/calendars" className="underline underline-offset-4">Connect a calendar</Link> to see busy times here.</p>}
        {error ? (
          <div role="alert" className="space-y-3 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Try again</Button>
            {" "}<Link href="/calendars" className="underline underline-offset-4">Check calendar connections</Link>
          </div>
        ) : loading ? <ClockLoader label="Loading your week" /> : (
          <>
            {context.hasCalendars && !week?.events.length && <p className="text-sm text-muted-foreground">No synced busy events this week. If you expect events, <Link href="/calendars" className="underline underline-offset-4">sync your calendars</Link>.</p>}
            <WeekCalendar weekStart={weekStart} onWeekChange={setWeekStart} events={week?.events ?? []} availableHours={hours} timezone={context.timezone} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
