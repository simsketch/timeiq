"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMinutes, addMonths, addWeeks, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Keyboard, List } from "lucide-react";
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
  /** Can be dragged to a new time (needs onEventMove). */
  movable?: boolean;
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(localStorage.getItem(key) || fallback);
    } catch {
      // No storage: keep the default.
    }
  }, [key, fallback]);
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

type Mode = "day" | "week" | "month";
const MODE_LABEL: Record<Mode, string> = { day: "Day", week: "Week", month: "Month" };
/** Clicking or dragging on the grid picks half hours; dragging an event moves it in quarter hours. */
const SLOT_PX = HOUR_PX / 2;
const MOVE_MINUTES = 15;

type Press =
  | { kind: "create"; day: number; slot: number; y: number; mouse: boolean }
  | { kind: "move"; id: string; day: number; x: number; y: number; colWidth: number; moved: boolean };

export function WeekCalendar({
  events: sourceEvents,
  availableHours = [],
  timezone,
  weekStart,
  onWeekChange,
  onSelect,
  onSlotClick,
  onEventMove,
  onRangeChange,
  onNew,
  emptyHint,
}: {
  events: CalEvent[];
  availableHours?: WeeklyHours[];
  timezone?: string;
  weekStart: Date;
  onWeekChange: (start: Date) => void;
  onSelect?: (ev: CalEvent) => void;
  /** An empty part of the grid was clicked (a half hour) or dragged over (minutes set), in the zone the grid is shown in. */
  onSlotClick?: (start: Date, zone: string, minutes?: number) => void;
  /** A movable event was dragged to a new start. */
  onEventMove?: (ev: CalEvent, start: Date, zone: string) => void;
  /** The instants shown; giving it turns on the month view, which can reach past the parent's week. */
  onRangeChange?: (start: Date, end: Date) => void;
  /** The N shortcut. */
  onNew?: () => void;
  emptyHint?: string;
}) {
  // Availability rules are wall-clock times in the account zone (or the browser's).
  // The browser zone, the zone list and the screen width differ between server
  // and browser, so they are read after hydration.
  const [clientZone, setClientZone] = useState<string | null>(null);
  const [allZones, setAllZones] = useState<string[]>([]);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setClientZone(browserZone());
    try {
      setAllZones((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []);
    } catch {
      setAllZones([]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const baseZone = timezone ?? clientZone ?? "UTC";
  const [storedZone, setStoredZone] = useStoredPref("timeiq-cal-zone", "");
  const viewZone = storedZone || baseZone;
  const [fullDayPref, setFullDayPref] = useStoredPref("timeiq-cal-24h", "0");
  const fullDay = fullDayPref === "1";
  // Phones start on one day, wider screens on the week; each remembers its own choice.
  const modes: Mode[] = onRangeChange ? ["day", "week", "month"] : ["day", "week"];
  const [storedMode, setStoredMode] = useStoredPref(`timeiq-cal-mode-${narrow ? "phone" : "wide"}`, "");
  const mode: Mode = (modes as string[]).includes(storedMode) ? (storedMode as Mode) : narrow ? "day" : "week";
  const zones = useMemo(() => Array.from(new Set([baseZone, viewZone, ...allZones])), [baseZone, viewZone, allZones]);
  const events = useMemo(() => sourceEvents.map((event) => ({
    ...event,
    start: calendarDate(event.start, viewZone),
    end: calendarDate(event.end, viewZone),
  })), [sourceEvents, viewZone]);
  const source = (ev: CalEvent) => sourceEvents.find((event) => event.id === ev.id) ?? ev;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The clock is read after hydration so server and browser render the same grid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const displayNow = now && calendarDate(now, viewZone);

  // The day the day and month views show; always inside the parent's week.
  const [focusDay, setFocusDay] = useState<Date>(weekStart);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focusDay < weekStart || focusDay >= addDays(weekStart, 7)) setFocusDay(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);
  const focusedToday = useRef(false);
  useEffect(() => {
    if (focusedToday.current || !displayNow) return;
    focusedToday.current = true;
    const today = startOfDay(displayNow);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (today >= weekStart && today < addDays(weekStart, 7)) setFocusDay(today);
  }, [displayNow, weekStart]);
  function focus(day: Date) {
    const d = startOfDay(day);
    setFocusDay(d);
    const start = startOfWeek(d, { weekStartsOn: 1 });
    if (start.getTime() !== weekStart.getTime()) onWeekChange(start);
  }
  function step(dir: 1 | -1) {
    if (mode === "day") focus(addDays(focusDay, dir));
    else if (mode === "week") focus(addWeeks(focusDay, dir));
    else focus(addMonths(startOfMonth(focusDay), dir));
  }
  const goToday = () => focus(calendarDate(new Date(), viewZone));
  const chooseMode = (m: Mode) => (modes.includes(m) ? setStoredMode(m) : undefined);

  // Day and week report the week, so stepping through days doesn't refetch.
  const monthGridStart = startOfWeek(startOfMonth(focusDay), { weekStartsOn: 1 });
  const rangeStart = mode === "month" ? monthGridStart : weekStart;
  const rangeEnd = addDays(rangeStart, mode === "month" ? 42 : 7);
  useEffect(() => {
    onRangeChange?.(calendarInstant(rangeStart, viewZone), calendarInstant(rangeEnd, viewZone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart.getTime(), rangeEnd.getTime(), viewZone]);

  const days = useMemo(
    () => (mode === "day" ? [focusDay] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))),
    [mode, focusDay, weekStart]
  );
  const viewStart = days[0];
  const viewEnd = addDays(days[days.length - 1], 1);

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

  // 8 AM to 8 PM, stretched to fit the shown events and open hours; or the
  // whole day, scrolled to the current time (or the first event or 7 AM).
  const inView = events.filter((e) => e.end > viewStart && e.start < viewEnd);
  const nowInView = !!displayNow && displayNow >= viewStart && displayNow < viewEnd;
  const nowHours = displayNow ? displayNow.getHours() + displayNow.getMinutes() / 60 : 0;
  let startHour = 0;
  let endHour = 24;
  if (!fullDay) {
    startHour = 8;
    endHour = 20;
    for (const e of [...inView, ...openBlocks]) {
      if (e.allDay) continue;
      startHour = Math.min(startHour, e.start.getHours());
      endHour = Math.max(endHour, isSameDay(e.start, e.end) ? e.end.getHours() + (e.end.getMinutes() ? 1 : 0) : 24);
    }
    // Keep the now line on screen too, unless it's the middle of the night:
    // stretching to 2 AM would make the default view nearly the whole day.
    if (nowInView && nowHours >= 6 && nowHours < 22) {
      startHour = Math.min(startHour, Math.floor(nowHours));
      endHour = Math.max(endHour, Math.floor(nowHours) + 1);
    }
    endHour = Math.min(endHour, 24);
  }
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const nowVisible = nowInView && nowHours >= startHour && nowHours < endHour;
  const firstHour = Math.min(7, ...inView.filter((e) => !e.allDay).map((e) => e.start.getHours()));
  const scrollHour = !fullDay ? 0 : nowInView ? Math.max(0, nowHours - 2) : firstHour;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scrollHour * HOUR_PX;
    // Only when the days, zone or range change, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStart.getTime(), mode, nowInView, fullDay, viewZone]);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const allDayFor = (day: Date) =>
    inView.filter((e) => e.allDay && e.start < addDays(day, 1) && e.end > day);
  const hasAllDay = days.some((d) => allDayFor(d).length);

  // Pointer gestures: drag on empty grid to size a new booking, drag a movable
  // event to move it. Touch keeps scrolling the grid: a tap still picks a slot.
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);
  const [draft, setDraft] = useState<{ day: number; a: number; b: number } | null>(null);
  const [moving, setMoving] = useState<{ id: string; dDay: number; dMin: number; colWidth: number } | null>(null);
  const slotCount = hours.length * 2;
  const slotAt = (clientY: number, col: HTMLElement) =>
    Math.max(0, Math.min(slotCount - 1, Math.floor((clientY - col.getBoundingClientRect().top) / SLOT_PX)));
  const slotStart = (day: Date, slot: number) => {
    const start = new Date(day);
    start.setHours(0, startHour * 60 + slot * 30, 0, 0);
    return start;
  };

  // Keyboard: T today, ← → step, D W M views, N new booking.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === "t") goToday();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (key === "d") chooseMode("day");
      else if (key === "w") chooseMode("week");
      else if (key === "m" && modes.includes("month")) chooseMode("month");
      else if (key === "n" && onNew) onNew();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const label =
    mode === "day"
      ? format(focusDay, "EEEE, MMM d, yyyy")
      : mode === "month"
        ? format(focusDay, "MMMM yyyy")
        : format(weekStart, "MMM d") + " – " + format(addDays(weekStart, 6), "MMM d, yyyy");
  const shortcuts = `Shortcuts: T today · ← → previous/next · D day · W week${modes.includes("month") ? " · M month" : ""}${onNew ? " · N new booking" : ""}`;
  const columns = { gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={goToday}>
          Today
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Previous ${mode}`} onClick={() => step(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Next ${mode}`} onClick={() => step(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="font-medium">{label}</span>
        {mode !== "month" && !inView.length && emptyHint && <span className="hidden text-sm text-muted-foreground sm:inline">· {emptyHint}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Calendar range">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm transition-colors",
                  mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          {mode !== "month" && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={fullDay} onChange={(e) => setFullDayPref(e.target.checked ? "1" : "0")} />
              Show all 24h
            </label>
          )}
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
          <span className="hidden text-muted-foreground lg:inline-flex" title={shortcuts} aria-label={shortcuts} role="img">
            <Keyboard className="h-4 w-4" />
          </span>
        </div>
      </div>

      {mode === "month" ? (
        <MonthGrid
          gridStart={monthGridStart}
          focusDay={focusDay}
          today={displayNow}
          events={events}
          onPickDay={(d) => {
            focus(d);
            chooseMode("day");
          }}
          onSelect={(ev) => onSelect?.(source(ev))}
        />
      ) : (
      <div ref={scroller} className={cn("w-full max-w-full overflow-auto overscroll-contain rounded-xl border", fullDay && "max-h-[min(70vh,680px)]")}>
        <div className={cn(days.length === 7 && "min-w-[720px]")}>
          <div className="sticky top-0 z-20 bg-background">
          {/* Day headers: in the week, a day opens it on its own */}
          <div className="grid border-b bg-muted/30" style={columns}>
            <div />
            {days.map((d) => {
              const today = displayNow && isSameDay(d, displayNow);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    focus(d);
                    chooseMode("day");
                  }}
                  disabled={mode === "day"}
                  className="px-2 py-2 text-center enabled:hover:bg-muted/60"
                  aria-label={`Show ${format(d, "EEEE, MMMM d")}`}
                >
                  <div className="text-xs text-muted-foreground">{format(d, "EEE")}</div>
                  <div
                    className={cn(
                      "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      today && "bg-foreground text-background"
                    )}
                  >
                    {format(d, "d")}
                  </div>
                </button>
              );
            })}
          </div>

          {hasAllDay && (
            <div className="grid border-b" style={columns}>
              <div className="px-1 py-1.5 text-right text-[10px] text-muted-foreground">All day</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="space-y-1 border-l p-1">
                  {allDayFor(d).map((e) => (
                    <button
                      key={e.id + d.toISOString()}
                      type="button"
                      onClick={() => onSelect?.(source(e))}
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
          <div ref={grid} className="relative grid" style={columns}>
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
            {days.map((d, dayIndex) => {
              const placed = placeDay(inView, d, startHour, endHour);
              const showNow = displayNow && isSameDay(d, displayNow);
              const draftHere = draft && draft.day === dayIndex ? { lo: Math.min(draft.a, draft.b), hi: Math.max(draft.a, draft.b) + 1 } : null;
              return (
                <div
                  key={d.toISOString()}
                  className={cn("relative select-none border-l", onSlotClick && "cursor-pointer")}
                  onPointerDown={onSlotClick ? (e) => {
                    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-cal-event]")) return;
                    const slot = slotAt(e.clientY, e.currentTarget);
                    const mouse = e.pointerType !== "touch";
                    press.current = { kind: "create", day: dayIndex, slot, y: e.clientY, mouse };
                    if (mouse) {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDraft({ day: dayIndex, a: slot, b: slot });
                    }
                  } : undefined}
                  onPointerMove={(e) => {
                    const p = press.current;
                    if (p?.kind === "create" && p.mouse) {
                      const slot = slotAt(e.clientY, e.currentTarget);
                      setDraft((cur) => (cur && cur.b !== slot ? { ...cur, b: slot } : cur));
                    }
                  }}
                  onPointerUp={(e) => {
                    const p = press.current;
                    if (p?.kind !== "create" || !onSlotClick) return;
                    press.current = null;
                    setDraft(null);
                    let lo = p.slot;
                    let hi = p.slot + 1;
                    if (p.mouse) {
                      const b = slotAt(e.clientY, e.currentTarget);
                      lo = Math.min(p.slot, b);
                      hi = Math.max(p.slot, b) + 1;
                    } else if (Math.abs(e.clientY - p.y) > 8) {
                      return; // a scroll, not a tap
                    }
                    onSlotClick(calendarInstant(slotStart(d, lo), viewZone), viewZone, hi - lo > 1 ? (hi - lo) * 30 : undefined);
                  }}
                  onPointerCancel={() => {
                    press.current = null;
                    setDraft(null);
                  }}
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
                  {draftHere && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-10 rounded-md border border-primary bg-primary/15 px-1.5 py-1 text-xs font-medium text-primary"
                      style={{ top: draftHere.lo * SLOT_PX, height: (draftHere.hi - draftHere.lo) * SLOT_PX }}
                    >
                      {format(slotStart(d, draftHere.lo), "h:mm")}–{format(slotStart(d, draftHere.hi), "h:mm a")}
                    </div>
                  )}
                  {placed.map(({ ev, top, height, col, cols }) => {
                    const drag = moving?.id === ev.id ? moving : null;
                    const canMove = !!onEventMove && ev.movable;
                    return (
                    <button
                      key={ev.id}
                      type="button"
                      data-cal-event
                      onPointerDown={canMove ? (e) => {
                        if (e.button !== 0 || e.pointerType === "touch") return;
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const colWidth = grid.current ? (grid.current.clientWidth - 52) / days.length : 100;
                        press.current = { kind: "move", id: ev.id, day: dayIndex, x: e.clientX, y: e.clientY, colWidth, moved: false };
                      } : undefined}
                      onPointerMove={canMove ? (e) => {
                        const p = press.current;
                        if (p?.kind !== "move" || p.id !== ev.id) return;
                        const dy = e.clientY - p.y;
                        const dx = e.clientX - p.x;
                        const dDay = Math.max(-p.day, Math.min(days.length - 1 - p.day, Math.round(dx / p.colWidth)));
                        const dMin = Math.round(((dy / HOUR_PX) * 60) / MOVE_MINUTES) * MOVE_MINUTES;
                        if (!p.moved && Math.abs(dy) < 5 && Math.abs(dx) < 5) return;
                        p.moved = true;
                        setMoving((cur) => (cur && cur.dDay === dDay && cur.dMin === dMin ? cur : { id: ev.id, dDay, dMin, colWidth: p.colWidth }));
                      } : undefined}
                      onPointerUp={canMove ? () => {
                        const p = press.current;
                        if (p?.kind !== "move" || p.id !== ev.id) return;
                        press.current = null;
                        const m = moving;
                        setMoving(null);
                        if (!p.moved || !m) return;
                        swallowClick.current = true;
                        if (m.dDay || m.dMin) {
                          onEventMove!(source(ev), calendarInstant(addMinutes(addDays(ev.start, m.dDay), m.dMin), viewZone), viewZone);
                        }
                      } : undefined}
                      onPointerCancel={() => {
                        press.current = null;
                        setMoving(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (swallowClick.current) {
                          swallowClick.current = false;
                          return;
                        }
                        onSelect?.(source(ev));
                      }}
                      className={cn(
                        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-xs leading-tight shadow-sm transition-opacity hover:opacity-90",
                        ev.faded && "opacity-50",
                        canMove && "cursor-grab",
                        drag && "z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary"
                      )}
                      style={{
                        top,
                        height: height - 2,
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                        borderLeftColor: ev.color,
                        background: `color-mix(in srgb, ${ev.color} 16%, hsl(var(--background)))`,
                        transform: drag ? `translate(${drag.dDay * drag.colWidth}px, ${(drag.dMin / 60) * HOUR_PX}px)` : undefined,
                      }}
                      title={`${ev.title} · ${format(ev.start, "h:mm a")}–${format(ev.end, "h:mm a")}${canMove ? " · drag to move" : ""}`}
                    >
                      <div className="truncate font-medium">{ev.title}</div>
                      {(height > 34 || drag) && (
                        <div className="truncate text-muted-foreground">
                          {drag
                            ? `${format(addMinutes(addDays(ev.start, drag.dDay), drag.dMin), drag.dDay ? "EEE h:mm" : "h:mm")}–${format(addMinutes(addDays(ev.end, drag.dDay), drag.dMin), "h:mm a")}`
                            : `${format(ev.start, "h:mm")}–${format(ev.end, "h:mm a")}${ev.label ? ` · ${ev.label}` : ""}`}
                        </div>
                      )}
                    </button>
                    );
                  })}
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
      )}
    </div>
  );
}

/** Six weeks around a month; a day opens it in the day view. */
function MonthGrid({
  gridStart,
  focusDay,
  today,
  events,
  onPickDay,
  onSelect,
}: {
  gridStart: Date;
  focusDay: Date;
  today: Date | null;
  events: CalEvent[];
  onPickDay: (day: Date) => void;
  onSelect: (ev: CalEvent) => void;
}) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {cells.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="py-2 text-center text-xs text-muted-foreground">
            {format(d, "EEE")}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const dayEvents = events
            .filter((e) => e.start < addDays(d, 1) && e.end > d)
            .sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.getTime() - b.start.getTime());
          const shown = dayEvents.slice(0, 3);
          return (
            <div
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className={cn(
                "min-h-[4.5rem] cursor-pointer space-y-0.5 border-t p-1 hover:bg-muted/40 sm:min-h-[6rem]",
                i % 7 && "border-l",
                i < 7 && "border-t-0",
                !isSameMonth(d, focusDay) && "bg-muted/20 text-muted-foreground"
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickDay(d);
                }}
                aria-label={`Show ${format(d, "EEEE, MMMM d")}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  today && isSameDay(d, today) && "bg-foreground text-background"
                )}
              >
                {format(d, "d")}
              </button>
              {shown.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={(x) => {
                    x.stopPropagation();
                    onSelect(e);
                  }}
                  className={cn("block w-full truncate rounded px-1 text-left text-[10px] leading-4 sm:text-[11px]", e.faded && "opacity-50")}
                  style={{ background: `color-mix(in srgb, ${e.color} 18%, hsl(var(--background)))` }}
                  title={e.title}
                >
                  {!e.allDay && <span className="hidden text-muted-foreground sm:inline">{format(e.start, "h:mma").toLowerCase()} </span>}
                  {e.title}
                </button>
              ))}
              {dayEvents.length > shown.length && (
                <div className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - shown.length} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
