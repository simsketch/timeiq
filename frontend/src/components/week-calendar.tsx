"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  /** Any CSS color; used for the block's accent. */
  color: string;
  /** Small second line, e.g. the calendar it came from. */
  label?: string;
  faded?: boolean;
}

export type CalendarView = "calendar" | "list";

/** Calendar/List switch that remembers the choice per page. */
export function useCalendarView(key: string): [CalendarView, (v: CalendarView) => void] {
  const [view, setView] = useState<CalendarView>("calendar");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`timeiq-view-${key}`);
      // Storage exists only in the browser, so the saved choice is applied after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "list" || saved === "calendar") setView(saved);
    } catch {
      // No storage: stay on the calendar.
    }
  }, [key]);
  function choose(v: CalendarView) {
    setView(v);
    try {
      localStorage.setItem(`timeiq-view-${key}`, v);
    } catch {
      // Remembering the view is only a convenience.
    }
  }
  return [view, choose];
}

export function ViewToggle({ view, onChange }: { view: CalendarView; onChange: (v: CalendarView) => void }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="View">
      {(["calendar", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {v === "calendar" ? <CalendarDays className="h-4 w-4" /> : <List className="h-4 w-4" />}
          {v === "calendar" ? "Calendar" : "List"}
        </button>
      ))}
    </div>
  );
}

/** A stable color per key (e.g. calendar id), from a small palette that reads in light and dark. */
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const HOUR_PX = 44;

interface Placed {
  ev: CalEvent;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Lay out one day's timed events side by side where they overlap. */
function placeDay(events: CalEvent[], day: Date, startHour: number, endHour: number): Placed[] {
  const dayStart = new Date(day);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(endHour, 0, 0, 0);
  const items = events
    .filter((e) => !e.allDay && e.end > dayStart && e.start < dayEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => (p.cols = cols));
    placed.push(...cluster);
    cluster = [];
  };
  for (const ev of items) {
    const s = Math.max(ev.start.getTime(), dayStart.getTime());
    const e = Math.min(ev.end.getTime(), dayEnd.getTime());
    if (cluster.length && s >= clusterEnd) flush();
    const used = new Set(cluster.filter((p) => p.ev.end.getTime() > s).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col++;
    const top = ((s - dayStart.getTime()) / 3_600_000) * HOUR_PX;
    cluster.push({ ev, top, height: Math.max(((e - s) / 3_600_000) * HOUR_PX, 18), col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}

export function WeekCalendar({
  events,
  weekStart,
  onWeekChange,
  onSelect,
  emptyHint,
}: {
  events: CalEvent[];
  weekStart: Date;
  onWeekChange: (start: Date) => void;
  onSelect?: (ev: CalEvent) => void;
  emptyHint?: string;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The clock is read after hydration so server and browser render the same grid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Show 7 AM to 9 PM, stretched to fit anything earlier or later this week.
  const weekEnd = addDays(weekStart, 7);
  const inWeek = events.filter((e) => e.end > weekStart && e.start < weekEnd);
  let startHour = 7;
  let endHour = 21;
  for (const e of inWeek) {
    if (e.allDay) continue;
    startHour = Math.min(startHour, e.start.getHours());
    endHour = Math.max(endHour, e.end.getHours() + (e.end.getMinutes() ? 1 : 0) || 24);
  }
  endHour = Math.min(endHour, 24);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const allDayFor = (day: Date) =>
    inWeek.filter((e) => e.allDay && e.start < addDays(day, 1) && e.end > day);
  const hasAllDay = days.some((d) => allDayFor(d).length);

  const label =
    format(weekStart, "MMM d") + " – " + format(addDays(weekStart, 6), isSameDay(weekStart, addDays(weekStart, 6)) ? "d" : "MMM d, yyyy");

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onWeekChange(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Today
        </Button>
        <Button size="icon" variant="ghost" aria-label="Previous week" onClick={() => onWeekChange(addWeeks(weekStart, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Next week" onClick={() => onWeekChange(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="font-medium">{label}</span>
        {!inWeek.length && emptyHint && <span className="text-sm text-muted-foreground">· {emptyHint}</span>}
      </div>

      <div className="w-full max-w-full overflow-x-auto rounded-xl border">
        <div className="min-w-[720px]">
          {/* Day headers */}
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b bg-muted/30">
            <div />
            {days.map((d) => {
              const today = now && isSameDay(d, now);
              return (
                <div key={d.toISOString()} className="px-2 py-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</div>
                  <div
                    className={cn(
                      "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      today && "bg-foreground text-background"
                    )}
                  >
                    {format(d, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {hasAllDay && (
            <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b">
              <div className="px-1 py-1.5 text-right text-[10px] uppercase text-muted-foreground">All day</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="space-y-1 border-l p-1">
                  {allDayFor(d).map((e) => (
                    <button
                      key={e.id + d.toISOString()}
                      type="button"
                      onClick={() => onSelect?.(e)}
                      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-white", e.faded && "opacity-50")}
                      style={{ background: e.color }}
                      title={e.title}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Time grid */}
          <div className="relative grid grid-cols-[52px_repeat(7,1fr)]">
            <div>
              {hours.map((h) => (
                <div key={h} className="relative text-right" style={{ height: HOUR_PX }}>
                  <span className="absolute -top-2 right-1.5 text-[11px] text-muted-foreground">
                    {h === startHour ? "" : format(new Date(2000, 0, 1, h), "h a")}
                  </span>
                </div>
              ))}
            </div>
            {days.map((d) => {
              const placed = placeDay(inWeek, d, startHour, endHour);
              const showNow = now && isSameDay(d, now) && now.getHours() >= startHour && now.getHours() < endHour;
              return (
                <div key={d.toISOString()} className="relative border-l">
                  {hours.map((h) => (
                    <div key={h} className="border-t border-dashed border-border/60" style={{ height: HOUR_PX }} />
                  ))}
                  {placed.map(({ ev, top, height, col, cols }) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelect?.(ev)}
                      className={cn(
                        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-xs leading-tight shadow-sm transition-opacity hover:opacity-90",
                        ev.faded && "opacity-50"
                      )}
                      style={{
                        top,
                        height: height - 2,
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                        borderLeftColor: ev.color,
                        background: `color-mix(in srgb, ${ev.color} 16%, hsl(var(--background)))`,
                      }}
                      title={`${ev.title} · ${format(ev.start, "h:mm a")}–${format(ev.end, "h:mm a")}`}
                    >
                      <div className="truncate font-medium">{ev.title}</div>
                      {height > 34 && (
                        <div className="truncate text-muted-foreground">
                          {format(ev.start, "h:mm")}–{format(ev.end, "h:mm a")}
                          {ev.label ? ` · ${ev.label}` : ""}
                        </div>
                      )}
                    </button>
                  ))}
                  {showNow && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500"
                      style={{ top: ((now!.getHours() - startHour) + now!.getMinutes() / 60) * HOUR_PX }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
