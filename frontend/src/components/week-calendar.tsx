"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calendarDate, calendarInstant } from "@/lib/calendar-time";
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

export interface WeeklyHours {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
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

/** A small preference kept in localStorage, applied after hydration. */
function useStoredPref(key: string, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setValue(saved);
    } catch {
      // No storage: keep the default.
    }
  }, [key]);
  function choose(v: string) {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // Remembering is only a convenience.
    }
  }
  return [value, choose];
}

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function zoneLabel(zone: string): string {
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${zone.replace(/_/g, " ")} (${offset})`;
  } catch {
    return zone;
  }
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
    // Grid rows represent wall-clock hours, including on daylight-saving days.
    const minutes = (timestamp: number) => {
      const date = new Date(timestamp);
      return isSameDay(date, day) ? date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 : 24 * 60;
    };
    const top = ((minutes(s) - startHour * 60) / 60) * HOUR_PX;
    cluster.push({ ev, top, height: Math.max(((minutes(e) - minutes(s)) / 60) * HOUR_PX, 18), col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}

export function WeekCalendar({
  events: sourceEvents,
  availableHours = [],
  timezone,
  weekStart,
  onWeekChange,
  onSelect,
  onSlotClick,
  emptyHint,
}: {
  events: CalEvent[];
  availableHours?: WeeklyHours[];
  timezone?: string;
  weekStart: Date;
  onWeekChange: (start: Date) => void;
  onSelect?: (ev: CalEvent) => void;
  /** Called with the instant of the half hour clicked in an empty part of the grid, and the zone the grid is shown in. */
  onSlotClick?: (start: Date, zone: string) => void;
  emptyHint?: string;
}) {
  // Availability rules are wall-clock times in the account zone (or the browser's).
  // The browser zone and the zone list differ between server and browser, so
  // both are read after hydration.
  const [clientZone, setClientZone] = useState<string | null>(null);
  const [allZones, setAllZones] = useState<string[]>([]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setClientZone(browserZone());
    try {
      setAllZones((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []);
    } catch {
      setAllZones([]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const baseZone = timezone ?? clientZone ?? "UTC";
  const [storedZone, setStoredZone] = useStoredPref("timeiq-cal-zone", "");
  const viewZone = storedZone || baseZone;
  const [fullDayPref, setFullDayPref] = useStoredPref("timeiq-cal-24h", "0");
  const fullDay = fullDayPref === "1";
  const zones = useMemo(() => Array.from(new Set([baseZone, viewZone, ...allZones])), [baseZone, viewZone, allZones]);
  const events = useMemo(() => sourceEvents.map((event) => ({
    ...event,
    start: calendarDate(event.start, viewZone),
    end: calendarDate(event.end, viewZone),
  })), [sourceEvents, viewZone]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The clock is read after hydration so server and browser render the same grid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const displayNow = now && calendarDate(now, viewZone);
  const toView = (d: Date) => (viewZone === baseZone ? d : calendarDate(calendarInstant(d, baseZone), viewZone));
  const openBlocks: CalEvent[] = days.flatMap((day) => availableHours
    .filter((rule) => rule.is_active && rule.day_of_week === (day.getDay() + 6) % 7)
    .flatMap((rule, index) => {
      const start = new Date(day);
      const end = new Date(day);
      const [startHour, startMinute] = rule.start_time.split(":").map(Number);
      const [endHour, endMinute] = rule.end_time.split(":").map(Number);
      start.setHours(startHour, startMinute, 0, 0);
      end.setHours(endHour, endMinute, 0, 0);
      return end > start ? [{ id: `open-${day.getTime()}-${index}`, title: "Available", start: toView(start), end: toView(end), color: "#10b981" }] : [];
    }));

  // 8 AM to 8 PM, stretched to fit this week's events and open hours; or the
  // whole day, scrolled to the current time (or the first event or 7 AM).
  const weekEnd = addDays(weekStart, 7);
  const inWeek = events.filter((e) => e.end > weekStart && e.start < weekEnd);
  const nowInWeek = !!displayNow && displayNow >= weekStart && displayNow < weekEnd;
  const nowHours = displayNow ? displayNow.getHours() + displayNow.getMinutes() / 60 : 0;
  let startHour = 0;
  let endHour = 24;
  if (!fullDay) {
    startHour = 8;
    endHour = 20;
    for (const e of [...inWeek, ...openBlocks]) {
      if (e.allDay) continue;
      startHour = Math.min(startHour, e.start.getHours());
      endHour = Math.max(endHour, isSameDay(e.start, e.end) ? e.end.getHours() + (e.end.getMinutes() ? 1 : 0) : 24);
    }
    // Keep the now line on screen too.
    if (nowInWeek) {
      startHour = Math.min(startHour, Math.floor(nowHours));
      endHour = Math.max(endHour, Math.floor(nowHours) + 1);
    }
    endHour = Math.min(endHour, 24);
  }
  const scroller = useRef<HTMLDivElement>(null);
  const nowVisible = nowInWeek && nowHours >= startHour && nowHours < endHour;
  const firstHour = Math.min(7, ...inWeek.filter((e) => !e.allDay).map((e) => e.start.getHours()));
  const scrollHour = !fullDay ? 0 : nowInWeek ? Math.max(0, nowHours - 2) : firstHour;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scrollHour * HOUR_PX;
    // Only when the week, zone or range changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, nowInWeek, fullDay, viewZone]);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const allDayFor = (day: Date) =>
    inWeek.filter((e) => e.allDay && e.start < addDays(day, 1) && e.end > day);
  const hasAllDay = days.some((d) => allDayFor(d).length);

  const label =
    format(weekStart, "MMM d") + " – " + format(addDays(weekStart, 6), isSameDay(weekStart, addDays(weekStart, 6)) ? "d" : "MMM d, yyyy");

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onWeekChange(startOfWeek(calendarDate(new Date(), viewZone), { weekStartsOn: 1 }))}>
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
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={fullDay} onChange={(e) => setFullDayPref(e.target.checked ? "1" : "0")} />
            Show all 24h
          </label>
          <select
            aria-label="Time zone"
            value={viewZone}
            onChange={(e) => setStoredZone(e.target.value === baseZone ? "" : e.target.value)}
            className="h-8 max-w-[18rem] rounded-md border bg-background px-2 text-sm"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {zoneLabel(z)}{z === baseZone ? " · yours" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div ref={scroller} className={cn("w-full max-w-full overflow-auto overscroll-contain rounded-xl border", fullDay && "max-h-[min(70vh,680px)]")}>
        <div className="min-w-[720px]">
          <div className="sticky top-0 z-20 bg-background">
          {/* Day headers */}
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b bg-muted/30">
            <div />
            {days.map((d) => {
              const today = displayNow && isSameDay(d, displayNow);
              return (
                <div key={d.toISOString()} className="px-2 py-2 text-center">
                  <div className="text-xs text-muted-foreground">{format(d, "EEE")}</div>
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
              <div className="px-1 py-1.5 text-right text-[10px] text-muted-foreground">All day</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="space-y-1 border-l p-1">
                  {allDayFor(d).map((e) => (
                    <button
                      key={e.id + d.toISOString()}
                      type="button"
                      onClick={() => onSelect?.(sourceEvents.find((event) => event.id === e.id) ?? e)}
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

          </div>

          {/* Time grid */}
          <div className="relative grid grid-cols-[52px_repeat(7,1fr)]">
            <div className="relative">
              {hours.map((h) => (
                <div key={h} className="relative text-right" style={{ height: HOUR_PX }}>
                  <span className="absolute -top-2 right-1.5 text-[11px] text-muted-foreground">
                    {h === startHour ? "" : format(new Date(2000, 0, 1, h), "h a")}
                  </span>
                </div>
              ))}
              {nowVisible && (
                <span
                  className="pointer-events-none absolute right-1 z-10 -translate-y-1/2 rounded bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white"
                  style={{ top: (nowHours - startHour) * HOUR_PX }}
                >
                  {format(displayNow!, "h:mm")}
                </span>
              )}
            </div>
            {days.map((d) => {
              const placed = placeDay(inWeek, d, startHour, endHour);
              const showNow = displayNow && isSameDay(d, displayNow);
              return (
                <div
                  key={d.toISOString()}
                  className={cn("relative border-l", onSlotClick && "cursor-pointer")}
                  onClick={onSlotClick ? (e) => {
                    const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const start = new Date(d);
                    start.setHours(0, startHour * 60 + Math.floor((offset / HOUR_PX) * 2) * 30, 0, 0);
                    onSlotClick(calendarInstant(start, viewZone), viewZone);
                  } : undefined}
                >
                  {hours.map((h) => (
                    <div key={h} className="border-t border-dashed border-border/60" style={{ height: HOUR_PX }} />
                  ))}
                  {placeDay(openBlocks, d, startHour, endHour).map(({ ev, top, height }) => (
                    <div key={ev.id} className="pointer-events-none absolute inset-x-0 overflow-hidden border-y border-emerald-500/20 bg-emerald-500/10 px-1.5 py-1 text-[10px] text-emerald-800 dark:text-emerald-300"
                      style={{ top, height }} title={`Available · ${format(ev.start, "h:mm a")}–${format(ev.end, "h:mm a")}`}>
                      Available
                    </div>
                  ))}
                  {placed.map(({ ev, top, height, col, cols }) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(sourceEvents.find((event) => event.id === ev.id) ?? ev);
                      }}
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
                  {nowVisible && (
                    // Apple Calendar style: a faint line across the week, a solid one with a dot on today.
                    <div
                      className={cn("pointer-events-none absolute left-0 right-0 z-10", showNow ? "border-t-2 border-red-500" : "border-t border-red-500/30")}
                      style={{ top: (nowHours - startHour) * HOUR_PX }}
                    >
                      {showNow && <span className="absolute -left-[5px] -top-[6px] h-2.5 w-2.5 rounded-full bg-red-500" />}
                    </div>
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
