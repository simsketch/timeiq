import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  type GestureResponderEvent,
  Pressable,
  type RefreshControlProps,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Segmented } from "@/components/ui";
import { ZonePicker, zoneLabel } from "@/components/zone-picker";
import { ApiError, type Booking, type CachedEvent, useApi } from "@/lib/api";
import { colorFor, useTheme } from "@/lib/theme";
import { dayKey, fmt, timeOf, wallMinutes, wallParts, zoneDayStart, zoneTime } from "@/lib/time";

/** One block on the calendar: a booking, or an event synced from a connected calendar. */
export interface CalItem {
  id: string;
  kind: "booking" | "synced";
  title: string;
  start: Date;
  end: Date;
  /** All-day items cover the UTC dates from start up to (not including) end, as the API sends them. */
  allDay?: boolean;
  color: string;
  /** Small second line, e.g. the calendar it came from. */
  label?: string;
  faded?: boolean;
  /** Can be held and dragged to a new time (needs onMove). */
  movable?: boolean;
}

export type CalMode = "day" | "3day" | "week";

const MODES: { value: CalMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "3day", label: "3 days" },
  { value: "week", label: "Week" },
];

// Choices last for the app session; the app has no persistent storage.
const prefs: { mode: CalMode; fullDay: boolean; zone: string | null } = { mode: "3day", fullDay: false, zone: null };

const HOUR_PX = 48;
/** Taps and drags on the grid pick half hours; a dragged booking moves in quarter hours. */
const SLOT_PX = HOUR_PX / 2;
const MOVE_MINUTES = 15;
const GUTTER = 46;
const LONG_PRESS_MS = 350;
const SLOP = 8;
const SYNCED_COLOR = "#94a3b8";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Bookings as calendar items, colored by event type (as on the website). */
export function bookingItems(bookings: Booking[], typeNames: Record<string, string> = {}, now = new Date()): CalItem[] {
  // A moved booking's earlier slot only clutters the grid.
  const replaced = new Set(bookings.map((b) => b.rescheduled_from_id).filter(Boolean).map(String));
  return bookings
    .filter((b) => !replaced.has(String(b.id)))
    .map((b) => ({
      id: String(b.id),
      kind: "booking" as const,
      title: b.visitor_name,
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
      color: colorFor(String(b.event_type_id)),
      label: b.status === "cancelled" ? "Cancelled" : b.status === "pending_payment" ? "Waiting for payment" : typeNames[String(b.event_type_id)],
      faded: b.status === "cancelled",
      movable: b.status === "confirmed" && new Date(b.starts_at) > now,
    }));
}

/** Synced calendar events as faded, read-only calendar items. */
export function syncedItems(events: CachedEvent[]): CalItem[] {
  return events.map((e) => ({
    id: `synced-${e.id}`,
    kind: "synced" as const,
    title: e.title || "Busy",
    start: new Date(e.starts_at),
    end: new Date(e.ends_at),
    allDay: e.is_all_day,
    color: SYNCED_COLOR,
    label: e.source_name ?? undefined,
    faded: true,
  }));
}

type Api = ReturnType<typeof useApi>;

/** Ask, then move a booking and send the guest the new invite; an overlap asks again with "Move anyway".
 * Resolves true once moved (after `onMoved`, e.g. a reload, finishes). */
export function confirmMove(api: Api, item: CalItem, start: Date, zone: string, homeZone: string, onMoved: () => Promise<unknown> | void): Promise<boolean> {
  const where = zone !== homeZone ? ` (${zone.split("/").pop()!.replace(/_/g, " ")} time)` : "";
  const when = `${fmt(start, zone, { weekday: "short", month: "short", day: "numeric" })} at ${timeOf(start, zone)}${where}`;
  return new Promise((resolve) => {
    const attempt = async (allowConflict: boolean) => {
      try {
        const moved = await api<Booking>(`/api/bookings/${item.id}/reschedule`, {
          method: "POST",
          body: JSON.stringify({ starts_at: start.toISOString(), allow_conflict: allowConflict }),
        });
        await onMoved();
        resolve(true);
        Alert.alert("Moved", `${moved.visitor_name} got the updated invite.`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "The booking didn't move.";
        if (e instanceof ApiError && e.status === 409 && !allowConflict) {
          Alert.alert(
            "This time overlaps",
            message.replace(/^This time overlaps: /, ""),
            [
              { text: "Pick another time", style: "cancel", onPress: () => resolve(false) },
              { text: "Move anyway", onPress: () => attempt(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        } else {
          resolve(false);
          Alert.alert("Not moved", message);
        }
      }
    };
    Alert.alert(
      "Move this booking?",
      `Move to ${when} and send ${item.title} an updated invite?`,
      [
        { text: "Keep it", style: "cancel", onPress: () => resolve(false) },
        { text: "Move", onPress: () => attempt(false) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

interface Placed {
  item: CalItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

type Drag = { kind: "create"; c: number; a: number; b: number } | { kind: "move"; id: string; c: number; dCol: number; dMin: number };

interface Press {
  x: number;
  y: number;
  px: number;
  py: number;
  c: number;
  slot: number;
  hit: Placed | null;
  timer: ReturnType<typeof setTimeout> | null;
  active: "create" | "move" | null;
  moved: boolean;
  b: number;
  dCol: number;
  dMin: number;
}

const hourLabel = (h: number) => (h === 0 || h === 24 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const isoDate = (d: Date, zone: string) => {
  const p = wallParts(d, zone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A scrolling Day / 3-day / Week time grid in any IANA zone. Tap an empty half hour
 * to book it, hold and drag to set the length, hold a movable booking and drag to move it. */
export function WeekCalendar({
  items,
  zone,
  date,
  onDateChange,
  onRangeChange,
  onSelect,
  onSlotPress,
  onMove,
  gridHeight,
  refreshControl,
  hint,
}: {
  items: CalItem[];
  /** The account's zone; the grid starts in it and the picker marks it. */
  zone: string;
  /** The day to show (controlled); without it the calendar keeps its own. */
  date?: Date;
  onDateChange?: (d: Date) => void;
  /** The instants shown, for fetching synced events. */
  onRangeChange?: (start: Date, end: Date) => void;
  /** A booking was tapped (synced events show their details themselves). */
  onSelect?: (item: CalItem) => void;
  /** An empty half hour was tapped, or a span held and dragged over (minutes set). */
  onSlotPress?: (start: Date, minutes?: number) => void;
  /** A movable booking was dragged to a new start; return a promise to hold it there until settled. */
  onMove?: (item: CalItem, start: Date, zone: string) => Promise<unknown> | void;
  /** A fixed height (inside another scroll view); otherwise the calendar fills its parent. */
  gridHeight?: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Shown when nothing is in view. */
  hint?: string;
}) {
  const t = useTheme();
  const [mode, setModeState] = useState<CalMode>(prefs.mode);
  const setMode = (m: CalMode) => {
    prefs.mode = m;
    setModeState(m);
  };
  const [fullDay, setFullDayState] = useState(prefs.fullDay);
  const setFullDay = (v: boolean) => {
    prefs.fullDay = v;
    setFullDayState(v);
  };
  const [pickedZone, setPickedZone] = useState(prefs.zone);
  const viewZone = pickedZone || zone;
  const [zonePicker, setZonePicker] = useState(false);

  const [ownDate, setOwnDate] = useState(() => new Date());
  const anchor = date ?? ownDate;
  const setAnchor = (d: Date) => {
    setOwnDate(d);
    onDateChange?.(d);
  };
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The columns: midnights in the shown zone, and the midnight after each.
  const anchorKey = dayKey(anchor, viewZone);
  const days = useMemo(() => {
    if (mode === "day") return [zoneDayStart(anchor, viewZone)];
    if (mode === "3day") return [0, 1, 2].map((i) => zoneDayStart(anchor, viewZone, i));
    const weekday = WEEKDAYS.indexOf(fmt(anchor, viewZone, { weekday: "short" }));
    return Array.from({ length: 7 }, (_, i) => zoneDayStart(anchor, viewZone, i - weekday));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anchorKey, viewZone]);
  const ends = useMemo(() => days.map((d) => zoneDayStart(d, viewZone, 1)), [days, viewZone]);
  const rangeStart = days[0].getTime();
  const rangeEnd = ends[ends.length - 1].getTime();
  useEffect(() => {
    onRangeChange?.(new Date(rangeStart), new Date(rangeEnd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd]);

  const stepDays = mode === "day" ? 1 : mode === "3day" ? 3 : 7;
  const step = (dir: 1 | -1) => setAnchor(zoneDayStart(anchor, viewZone, dir * stepDays));

  // Minutes past the column's midnight, clamped to the column (wall clock, so
  // daylight-saving days still line up with the hour labels).
  const minsIn = (x: number, c: number) => (x <= days[c].getTime() ? 0 : x >= ends[c].getTime() ? 1440 : wallMinutes(new Date(x), viewZone));

  const timed = useMemo(
    () => items.filter((i) => !i.allDay && i.end.getTime() > rangeStart && i.start.getTime() < rangeEnd),
    [items, rangeStart, rangeEnd]
  );
  const nowCol = days.findIndex((d, c) => now >= d && now < ends[c]);
  const nowMin = wallMinutes(now, viewZone);

  // 8 AM to 8 PM, stretched to fit the shown events and the current time; or the whole day.
  let startHour = 0;
  let endHour = 24;
  if (!fullDay) {
    startHour = 8;
    endHour = 20;
    for (const it of timed) {
      days.forEach((d, c) => {
        if (it.end.getTime() <= d.getTime() || it.start.getTime() >= ends[c].getTime()) return;
        startHour = Math.min(startHour, Math.floor(minsIn(it.start.getTime(), c) / 60));
        endHour = Math.max(endHour, Math.ceil(minsIn(it.end.getTime(), c) / 60));
      });
    }
    // Keep the now line on screen too, unless it's the middle of the night.
    if (nowCol >= 0 && nowMin >= 6 * 60 && nowMin < 22 * 60) {
      startHour = Math.min(startHour, Math.floor(nowMin / 60));
      endHour = Math.max(endHour, Math.floor(nowMin / 60) + 1);
    }
    endHour = Math.min(endHour, 24);
  }
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const slotCount = hours.length * 2;
  const nowVisible = nowCol >= 0 && nowMin >= startHour * 60 && nowMin < endHour * 60;
  const nowTop = ((nowMin - startHour * 60) / 60) * HOUR_PX;

  // Lay out each column's timed items side by side where they overlap; synced
  // events first so bookings draw over them.
  const placed = useMemo(() => {
    const lo = startHour * 60;
    const hi = endHour * 60;
    return days.map((d, c) => {
      const list = timed
        .filter((it) => it.end.getTime() > d.getTime() && it.start.getTime() < ends[c].getTime())
        .map((it) => ({ it, s: Math.max(lo, minsIn(it.start.getTime(), c)), e: Math.min(hi, minsIn(it.end.getTime(), c)) }))
        .filter((x) => x.s < hi && x.e >= x.s)
        .sort((a, b) => a.s - b.s || b.e - a.e);
      const out: Placed[] = [];
      let cluster: (Placed & { e: number })[] = [];
      let clusterEnd = -1;
      const flush = () => {
        const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
        cluster.forEach((p) => out.push({ item: p.item, top: p.top, height: p.height, col: p.col, cols }));
        cluster = [];
      };
      for (const { it, s, e } of list) {
        if (cluster.length && s >= clusterEnd) flush();
        const used = new Set(cluster.filter((p) => p.e > s).map((p) => p.col));
        let col = 0;
        while (used.has(col)) col++;
        const top = ((s - lo) / 60) * HOUR_PX;
        cluster.push({ item: it, top, height: Math.max(((e - s) / 60) * HOUR_PX, 18), col, cols: 1, e });
        clusterEnd = Math.max(clusterEnd, e);
      }
      if (cluster.length) flush();
      return out.sort((a, b) => Number(b.item.kind === "synced") - Number(a.item.kind === "synced"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, days, ends, startHour, endHour, viewZone]);

  const allDayFor = useMemo(() => {
    const isos = days.map((d) => isoDate(d, viewZone));
    const list = items.filter((i) => i.allDay);
    return isos.map((iso) =>
      list.filter((i) => {
        const s = i.start.toISOString().slice(0, 10);
        const e = i.end.toISOString().slice(0, 10);
        return s <= iso && (e > iso || (e === s && s === iso));
      })
    );
  }, [items, days, viewZone]);
  const hasAllDay = allDayFor.some((l) => l.length);

  // Scroll to the current time (or the top of the range) when the view changes.
  const scroller = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    const firstHour = fullDay ? 7 : startHour;
    const y = nowCol >= 0 ? Math.max(0, nowMin / 60 - startHour - 2) * HOUR_PX : (firstHour - startHour) * HOUR_PX;
    const frame = requestAnimationFrame(() => scroller.current?.scrollTo({ y, animated: false }));
    return () => cancelAnimationFrame(frame);
    // Only when the days, mode, range or zone change, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, mode, fullDay, viewZone]);

  // Gestures. The grid body is the only touch target (box-only), so touch
  // coordinates are relative to it and blocks are hit-tested by position.
  const [bodyW, setBodyW] = useState(0);
  const colW = bodyW / days.length;
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const settling = useRef(false);

  const slotStart = (c: number, slot: number) => zoneTime(days[c], viewZone, 0, startHour * 60 + slot * 30);

  function hitTest(c: number, x: number, y: number): Placed | null {
    let found: Placed | null = null;
    for (const p of placed[c] ?? []) {
      const left = (p.col / p.cols) * colW;
      const right = ((p.col + 1) / p.cols) * colW;
      if (y >= p.top && y < p.top + p.height && x >= left && x < right) {
        // Bookings win over the synced events behind them.
        if (!found || found.item.kind === "synced" || p.item.kind === "booking") found = p;
      }
    }
    return found;
  }

  function showSynced(it: CalItem) {
    const when = it.allDay
      ? `${new Date(it.start.toISOString().slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} · all day`
      : `${fmt(it.start, viewZone, { weekday: "long", month: "long", day: "numeric" })} · ${timeOf(it.start, viewZone)} – ${timeOf(it.end, viewZone)}`;
    Alert.alert(it.title, `${when}\n${it.label ?? "Your calendar"}`);
  }

  function open(it: CalItem) {
    if (it.kind === "synced") showSynced(it);
    else onSelect?.(it);
  }

  function reset() {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    press.current = null;
    setScrollEnabled(true);
  }

  const interactive = !!(onSlotPress || onMove || onSelect) || timed.length > 0;
  const responder = {
    onStartShouldSetResponder: () => interactive && colW > 0 && !settling.current,
    onResponderTerminationRequest: () => !press.current?.active,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { locationX: x, locationY: y, pageX, pageY } = e.nativeEvent;
      const c = clamp(Math.floor(x / colW), 0, days.length - 1);
      const slot = clamp(Math.floor(y / SLOT_PX), 0, slotCount - 1);
      const p: Press = { x, y, px: pageX, py: pageY, c, slot, hit: hitTest(c, x - c * colW, y), timer: null, active: null, moved: false, b: slot, dCol: 0, dMin: 0 };
      p.timer = setTimeout(() => {
        const cur = press.current;
        if (!cur || cur.moved) return;
        if (cur.hit?.item.movable && cur.hit.item.kind === "booking" && onMove) {
          cur.active = "move";
          setDrag({ kind: "move", id: cur.hit.item.id, c: cur.c, dCol: 0, dMin: 0 });
        } else if (onSlotPress && cur.hit?.item.kind !== "booking") {
          cur.active = "create";
          setDrag({ kind: "create", c: cur.c, a: cur.slot, b: cur.slot });
        } else {
          return;
        }
        setScrollEnabled(false);
      }, LONG_PRESS_MS);
      press.current = p;
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const p = press.current;
      if (!p) return;
      const dx = e.nativeEvent.pageX - p.px;
      const dy = e.nativeEvent.pageY - p.py;
      if (!p.active) {
        if (!p.moved && (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP)) {
          p.moved = true;
          if (p.timer) clearTimeout(p.timer);
        }
        return;
      }
      if (p.active === "create") {
        const b = clamp(Math.floor((p.y + dy) / SLOT_PX), 0, slotCount - 1);
        if (b !== p.b) {
          p.b = b;
          setDrag({ kind: "create", c: p.c, a: p.slot, b });
        }
      } else {
        const dMin = Math.round(((dy / HOUR_PX) * 60) / MOVE_MINUTES) * MOVE_MINUTES;
        const dCol = clamp(Math.round(dx / colW), -p.c, days.length - 1 - p.c);
        if (dMin !== p.dMin || dCol !== p.dCol) {
          p.dMin = dMin;
          p.dCol = dCol;
          setDrag({ kind: "move", id: p.hit!.item.id, c: p.c, dCol, dMin });
        }
      }
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      if (press.current?.active) responder.onResponderMove(e); // count where the finger lifted
      const p = press.current;
      reset();
      if (!p) return;
      if (!p.active) {
        const dx = e.nativeEvent.pageX - p.px;
        const dy = e.nativeEvent.pageY - p.py;
        if (!p.moved) {
          if (p.hit) open(p.hit.item);
          else onSlotPress?.(slotStart(p.c, p.slot));
        } else if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
          step(dx < 0 ? 1 : -1); // a sideways swipe
        }
        return;
      }
      if (p.active === "create") {
        setDrag(null);
        const lo = Math.min(p.slot, p.b);
        const hi = Math.max(p.slot, p.b) + 1;
        onSlotPress?.(slotStart(p.c, lo), hi - lo > 1 ? (hi - lo) * 30 : undefined);
        return;
      }
      const item = p.hit!.item;
      if (!p.dCol && !p.dMin) return setDrag(null);
      const start = zoneTime(days[p.c + p.dCol], viewZone, 0, minsIn(item.start.getTime(), p.c) + p.dMin);
      const result = onMove?.(item, start, viewZone);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        // Hold the block where it was dropped until the move is confirmed or refused.
        settling.current = true;
        (result as Promise<unknown>).finally(() => {
          settling.current = false;
          setDrag(null);
        });
      } else {
        setDrag(null);
      }
    },
    onResponderTerminate: () => {
      reset();
      if (!settling.current) setDrag(null);
    },
  };

  // Header label: "Tue, Nov 4" or "Nov 3 – 9" (with the year when it isn't this year).
  const last = days[days.length - 1];
  const otherYear = wallParts(days[0], viewZone).year !== wallParts(now, viewZone).year;
  const label =
    days.length === 1
      ? fmt(days[0], viewZone, { weekday: "short", month: "short", day: "numeric", ...(otherYear ? { year: "numeric" } : {}) })
      : `${fmt(days[0], viewZone, { month: "short", day: "numeric" })} – ${fmt(last, viewZone, {
          ...(wallParts(days[0], viewZone).month === wallParts(last, viewZone).month ? {} : { month: "short" }),
          day: "numeric",
          ...(otherYear ? { year: "numeric" } : {}),
        })}`;
  const todayKey = dayKey(now, viewZone);
  const showsToday = nowCol >= 0 && (mode !== "3day" || nowCol === 0);
  const zoneChanged = viewZone !== zone;
  const narrow = days.length === 7;

  return (
    <View style={[styles.wrap, gridHeight == null && { flex: 1 }]}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAnchor(new Date())}
          disabled={showsToday}
          hitSlop={6}
          style={[styles.pill, { borderColor: t.border, opacity: showsToday ? 0.45 : 1 }]}
        >
          <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>Today</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${mode === "week" ? "week" : mode === "day" ? "day" : "3 days"}`} onPress={() => step(-1)} hitSlop={8} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={t.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Next ${mode === "week" ? "week" : mode === "day" ? "day" : "3 days"}`} onPress={() => step(1)} hitSlop={8} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={22} color={t.text} />
        </Pressable>
        <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Time zone: ${zoneLabel(viewZone)}. Change`}
          onPress={() => setZonePicker(true)}
          hitSlop={6}
          style={[styles.zone, { borderColor: zoneChanged ? t.primary : t.border }]}
        >
          <Ionicons name="globe-outline" size={15} color={zoneChanged ? t.primary : t.muted} />
          <Text style={{ color: zoneChanged ? t.primary : t.muted, fontSize: 13, fontWeight: "600", maxWidth: 96 }} numberOfLines={1}>
            {viewZone.split("/").pop()!.replace(/_/g, " ")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <View style={{ flex: 1 }}>
          <Segmented options={MODES} value={mode} onChange={setMode} />
        </View>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>All 24h</Text>
        <Switch value={fullDay} onValueChange={setFullDay} trackColor={{ true: t.primary }} accessibilityLabel="Show all 24 hours" style={styles.switch} />
      </View>

      {!!hint && !timed.length && !hasAllDay && <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text>}

      <View style={[styles.frame, { borderColor: t.border, backgroundColor: t.card }, gridHeight == null ? { flex: 1 } : { height: gridHeight }]}>
        {/* Day headers: in 3-day and week views, a day opens on its own. */}
        <View style={[styles.headRow, { borderColor: t.border }]}>
          <View style={{ width: GUTTER }} />
          {days.map((d) => {
            const k = dayKey(d, viewZone);
            const today = k === todayKey;
            return (
              <Pressable
                key={k}
                disabled={mode === "day"}
                onPress={() => {
                  setAnchor(d);
                  setMode("day");
                }}
                accessibilityRole="button"
                accessibilityLabel={`Show ${fmt(d, viewZone, { weekday: "long", month: "long", day: "numeric" })}`}
                style={styles.headCell}
              >
                <Text style={[styles.dow, { color: today ? t.primary : t.muted }]}>
                  {fmt(d, viewZone, { weekday: narrow ? "narrow" : "short" })}
                </Text>
                <View style={[styles.dom, today && { backgroundColor: t.primary }]}>
                  <Text style={{ color: today ? t.primaryText : t.text, fontSize: 15, fontWeight: "700" }}>{fmt(d, viewZone, { day: "numeric" })}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {hasAllDay && (
          <View style={[styles.allDayRow, { borderColor: t.border }]}>
            <Text style={[styles.allDayLabel, { color: t.muted }]}>All day</Text>
            {allDayFor.map((list, c) => (
              <View key={c} style={[styles.allDayCell, { borderColor: t.border }]}>
                {list.slice(0, 2).map((it) => (
                  <Pressable
                    key={it.id}
                    onPress={() => open(it)}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.title}, all day`}
                    style={[styles.allDayChip, { backgroundColor: it.color, opacity: it.faded ? 0.55 : 1 }]}
                  >
                    <Text style={styles.allDayText} numberOfLines={1}>{it.title}</Text>
                  </Pressable>
                ))}
                {list.length > 2 && (
                  <Text style={{ color: t.muted, fontSize: 10, paddingHorizontal: 2 }} onPress={() => Alert.alert("All day", list.map((i) => i.title).join("\n"))}>
                    +{list.length - 2} more
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <ScrollView ref={scroller} scrollEnabled={scrollEnabled} refreshControl={refreshControl} nestedScrollEnabled style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", height: hours.length * HOUR_PX + 8, paddingTop: 0 }}>
            <View style={{ width: GUTTER }}>
              {hours.map((h, i) =>
                // The first label would sit on the frame's edge; one under the now tag is hidden by it.
                i === 0 || (nowVisible && Math.abs(nowTop - i * HOUR_PX) < 14) ? null : (
                  <Text key={h} style={[styles.hour, { color: t.muted, top: i * HOUR_PX - 7 }]}>{hourLabel(h)}</Text>
                )
              )}
              {nowVisible && (
                <View style={[styles.nowTag, { backgroundColor: t.now, top: nowTop - 8 }]}>
                  <Text style={styles.nowTagText}>{timeOf(now, viewZone).replace(/\s?[AP]M$/, "")}</Text>
                </View>
              )}
            </View>

            <View
              style={{ flex: 1 }}
              pointerEvents="box-only"
              onLayout={(e) => setBodyW(e.nativeEvent.layout.width)}
              accessible
              accessibilityLabel={onSlotPress ? "Calendar grid. Tap a time to book it; hold and drag to set the length, or hold a booking to move it." : "Calendar grid"}
              {...responder}
            >
              {nowCol >= 0 && (
                <View style={[styles.todayTint, { left: nowCol * colW, width: colW, backgroundColor: t.primary }]} />
              )}
              {hours.map((h, i) => (
                <View key={h} style={[styles.hourLine, { top: i * HOUR_PX, borderColor: t.border }]} />
              ))}
              {days.map((d, c) => (
                <View key={c} style={[styles.colLine, { left: c * colW, borderColor: t.border }]} />
              ))}

              {colW > 0 &&
                placed.map((list, c) =>
                  list.map((p) => {
                    const moving = drag?.kind === "move" && drag.id === p.item.id ? drag : null;
                    const w = colW / p.cols;
                    const shiftedStart = moving ? zoneTime(days[c + moving.dCol], viewZone, 0, minsIn(p.item.start.getTime(), c) + moving.dMin) : null;
                    const shiftedEnd = shiftedStart ? new Date(shiftedStart.getTime() + p.item.end.getTime() - p.item.start.getTime()) : null;
                    return (
                      <View
                        key={`${p.item.id}-${c}`}
                        style={[
                          styles.block,
                          {
                            top: p.top,
                            height: p.height - 2,
                            left: c * colW + p.col * w + 1.5,
                            width: w - 3,
                            borderLeftColor: p.item.color,
                            backgroundColor: p.item.color + (p.item.kind === "synced" ? "33" : "2e"),
                            opacity: p.item.faded ? 0.55 : 1,
                          },
                          moving && {
                            zIndex: 30,
                            opacity: 0.95,
                            borderColor: t.primary,
                            borderWidth: 2,
                            borderLeftWidth: 3,
                            backgroundColor: t.card,
                            shadowColor: "#000",
                            shadowOpacity: 0.25,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 3 },
                            elevation: 6,
                            transform: [{ translateX: moving.dCol * colW }, { translateY: (moving.dMin / 60) * HOUR_PX }],
                          },
                        ]}
                      >
                        <Text style={[styles.blockTitle, { color: t.text, fontSize: narrow ? 10 : 12 }]} numberOfLines={p.height > 40 ? 2 : 1}>
                          {p.item.title}
                        </Text>
                        {(p.height > 36 || moving) && !(narrow && !moving && p.height < 56) && (
                          <Text style={[styles.blockSub, { color: t.muted, fontSize: narrow ? 9 : 11 }]} numberOfLines={1}>
                            {moving && shiftedStart && shiftedEnd
                              ? `${moving.dCol ? fmt(shiftedStart, viewZone, { weekday: "short" }) + " " : ""}${timeOf(shiftedStart, viewZone)} – ${timeOf(shiftedEnd, viewZone)}`
                              : `${timeOf(p.item.start, viewZone)}${p.item.label && !narrow ? ` · ${p.item.label}` : ""}`}
                          </Text>
                        )}
                      </View>
                    );
                  })
                )}

              {drag?.kind === "create" && colW > 0 && (() => {
                const lo = Math.min(drag.a, drag.b);
                const hi = Math.max(drag.a, drag.b) + 1;
                return (
                  <View style={[styles.draft, { top: lo * SLOT_PX, height: (hi - lo) * SLOT_PX, left: drag.c * colW + 2, width: colW - 4, borderColor: t.primary, backgroundColor: t.primary + "26" }]}>
                    <Text style={{ color: t.primary, fontSize: narrow ? 9 : 12, fontWeight: "700" }} numberOfLines={2}>
                      {timeOf(slotStart(drag.c, lo), viewZone)} – {timeOf(slotStart(drag.c, hi), viewZone)}
                    </Text>
                  </View>
                );
              })()}

              {nowVisible && (
                <>
                  <View style={[styles.nowFaint, { top: nowTop, backgroundColor: t.now }]} />
                  <View style={[styles.nowLine, { top: nowTop - 1, left: nowCol * colW, width: colW, backgroundColor: t.now }]} />
                  <View style={[styles.nowDot, { top: nowTop - 5, left: nowCol * colW - 5, backgroundColor: t.now }]} />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </View>

      <ZonePicker
        visible={zonePicker}
        current={viewZone}
        home={zone}
        onClose={() => setZonePicker(false)}
        onPick={(z) => {
          setZonePicker(false);
          const next = z === zone ? null : z;
          prefs.zone = next;
          setPickedZone(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  arrow: { width: 30, height: 32, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 16, fontWeight: "700" },
  zone: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  switch: { transform: [{ scale: 0.85 }] },
  hint: { fontSize: 13 },
  frame: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: "hidden" },
  headRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  headCell: { flex: 1, alignItems: "center", gap: 2 },
  dow: { fontSize: 11, fontWeight: "600" },
  dom: { minWidth: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  allDayRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  allDayLabel: { width: GUTTER, fontSize: 10, textAlign: "right", paddingRight: 6, paddingTop: 5 },
  allDayCell: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, padding: 2, gap: 2, minHeight: 24 },
  allDayChip: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  allDayText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  hour: { position: "absolute", right: 6, fontSize: 10, fontWeight: "500" },
  nowTag: { position: "absolute", right: 3, borderRadius: 4, paddingHorizontal: 3, height: 16, justifyContent: "center" },
  nowTagText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  todayTint: { position: "absolute", top: 0, bottom: 0, opacity: 0.04 },
  hourLine: { position: "absolute", left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  colLine: { position: "absolute", top: 0, bottom: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  block: { position: "absolute", borderRadius: 6, borderLeftWidth: 3, paddingHorizontal: 4, paddingVertical: 2, overflow: "hidden" },
  blockTitle: { fontWeight: "600" },
  blockSub: { marginTop: 1 },
  draft: { position: "absolute", zIndex: 20, borderRadius: 6, borderWidth: 1.5, paddingHorizontal: 4, paddingVertical: 2 },
  nowFaint: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.45, zIndex: 10 },
  nowLine: { position: "absolute", height: 2, zIndex: 11 },
  nowDot: { position: "absolute", width: 10, height: 10, borderRadius: 5, zIndex: 12 },
});
