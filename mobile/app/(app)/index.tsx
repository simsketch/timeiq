import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Notice } from "@/components/ui";
import { ApiError, type Booking, type CachedEvent, type EventType, useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { colorFor, useTheme } from "@/lib/theme";
import { dayKey, fmt, timeOf, zoneDayStart } from "@/lib/time";
import { useMe } from "@/lib/use-me";

type Item =
  | { kind: "booking"; id: string; start: Date; end: Date; title: string; sub: string; color: string; pending: boolean }
  | { kind: "event"; id: string; start: Date; end: Date; title: string; sub: string; allDay: boolean };

export default function Agenda() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selected, setSelected] = useState(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<CachedEvent[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Monday-to-Sunday week around the selected day, in the account's zone.
  const weekDays = useMemo(() => {
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(fmt(selected, zone, { weekday: "short" }));
    return Array.from({ length: 7 }, (_, i) => zoneDayStart(selected, zone, i - weekday));
  }, [selected, zone]);

  const load = useCallback(async () => {
    try {
      const start = weekDays[0];
      const end = zoneDayStart(weekDays[6], zone, 1);
      const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const [confirmed, pending, cached, eventTypes] = await Promise.all([
        api<Booking[]>("/api/bookings?status=confirmed"),
        api<Booking[]>("/api/bookings?status=pending_payment"),
        api<CachedEvent[]>(`/api/calendars/cached-events?${q}`),
        api<EventType[]>("/api/event-types"),
      ]);
      setBookings([...confirmed, ...pending]);
      setEvents(cached);
      setTypes(Object.fromEntries(eventTypes.map((e) => [String(e.id), e.name])));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 402
          ? "Your TimeIQ plan isn't active, so bookings can't load. Your account details are under Account."
          : e instanceof Error ? e.message : "Couldn't load your agenda."
      );
    }
  }, [api, weekDays, zone]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const key = dayKey(selected, zone);
  const items: Item[] = [
    ...events
      .filter((e) => (e.is_all_day ? e.starts_at.slice(0, 10) <= isoDay(key) && e.ends_at.slice(0, 10) > isoDay(key) : dayKey(new Date(e.starts_at), zone) === key))
      .map((e): Item => ({
        kind: "event",
        id: e.id,
        start: new Date(e.starts_at),
        end: new Date(e.ends_at),
        title: e.title || "Busy",
        sub: e.source_name ?? "Calendar",
        allDay: e.is_all_day,
      })),
    ...bookings
      .filter((b) => dayKey(new Date(b.starts_at), zone) === key)
      .map((b): Item => ({
        kind: "booking",
        id: b.id,
        start: new Date(b.starts_at),
        end: new Date(b.ends_at),
        title: b.visitor_name,
        sub: types[String(b.event_type_id)] ?? "Booking",
        color: colorFor(String(b.event_type_id)),
        pending: b.status === "pending_payment",
      })),
  ].sort((a, b) => Number(b.kind === "event" && b.allDay) - Number(a.kind === "event" && a.allDay) || a.start.getTime() - b.start.getTime());

  const today = dayKey(new Date(), zone);
  const bookingLink = me ? `${SITE_URL}/book/${me.username}` : null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.month, { color: t.muted }]}>{fmt(selected, zone, { month: "long", year: "numeric" })}</Text>
          <Text style={[styles.title, { color: t.text }]}>
            {key === today ? "Today" : fmt(selected, zone, { weekday: "long", month: "short", day: "numeric" })}
          </Text>
        </View>
        {key !== today && (
          <Pressable onPress={() => setSelected(new Date())} hitSlop={8} style={[styles.pill, { borderColor: t.border }]}>
            <Text style={{ color: t.text, fontWeight: "600" }}>Today</Text>
          </Pressable>
        )}
        {bookingLink && (
          <Pressable
            accessibilityLabel="Share your booking link"
            onPress={() => Share.share({ message: bookingLink, url: bookingLink })}
            hitSlop={8}
            style={[styles.iconBtn, { borderColor: t.border }]}
          >
            <Ionicons name="share-outline" size={20} color={t.text} />
          </Pressable>
        )}
      </View>

      <View style={styles.week}>
        <Pressable accessibilityLabel="Previous week" onPress={() => setSelected(zoneDayStart(selected, zone, -7))} hitSlop={6}>
          <Ionicons name="chevron-back" size={22} color={t.muted} />
        </Pressable>
        {weekDays.map((d) => {
          const k = dayKey(d, zone);
          const on = k === key;
          const busy = bookings.some((b) => dayKey(new Date(b.starts_at), zone) === k);
          return (
            <Pressable
              key={k}
              accessibilityLabel={fmt(d, zone, { weekday: "long", month: "long", day: "numeric" })}
              accessibilityState={{ selected: on }}
              onPress={() => setSelected(d)}
              style={[styles.day, on && { backgroundColor: t.primary }]}
            >
              <Text style={[styles.dow, { color: on ? t.primaryText : t.muted }]}>{fmt(d, zone, { weekday: "narrow" })}</Text>
              <Text style={[styles.dom, { color: on ? t.primaryText : k === today ? t.primary : t.text }]}>{fmt(d, zone, { day: "numeric" })}</Text>
              <View style={[styles.dot, { backgroundColor: busy ? (on ? t.primaryText : t.primary) : "transparent" }]} />
            </Pressable>
          );
        })}
        <Pressable accessibilityLabel="Next week" onPress={() => setSelected(zoneDayStart(selected, zone, 7))} hitSlop={6}>
          <Ionicons name="chevron-forward" size={22} color={t.muted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {error && <Notice tone="warn">{error}</Notice>}
        {!error && items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="sunny-outline" size={36} color={t.muted} />
            <Text style={[styles.emptyText, { color: t.muted }]}>Nothing on this day. Tap + to book a meeting.</Text>
          </View>
        )}
        {items.map((it) => {
          const allDay = it.kind === "event" && it.allDay;
          const row = (
            <View
              style={[
                styles.row,
                { backgroundColor: it.kind === "booking" ? t.card : "transparent", borderColor: t.border },
                it.kind === "event" && { borderStyle: "dashed" },
              ]}
            >
              <View style={[styles.bar, { backgroundColor: it.kind === "booking" ? it.color : t.busy }]} />
              <View style={styles.when}>
                {allDay ? (
                  <Text style={[styles.time, { color: t.muted }]}>All day</Text>
                ) : (
                  <>
                    <Text style={[styles.time, { color: it.kind === "booking" ? t.text : t.muted }]}>{timeOf(it.start, zone)}</Text>
                    <Text style={[styles.timeEnd, { color: t.muted }]}>{timeOf(it.end, zone)}</Text>
                  </>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: it.kind === "booking" ? t.text : t.muted }]}>{it.title}</Text>
                <Text numberOfLines={1} style={[styles.rowSub, { color: t.muted }]}>
                  {it.sub}
                  {it.kind === "booking" && it.pending ? " · waiting for payment" : ""}
                </Text>
              </View>
              {it.kind === "booking" && <Ionicons name="chevron-forward" size={18} color={t.muted} />}
            </View>
          );
          return it.kind === "booking" ? (
            <Pressable key={it.id} onPress={() => router.push({ pathname: "/booking/[id]", params: { id: it.id } })}>
              {row}
            </Pressable>
          ) : (
            <View key={it.id} accessibilityLabel={`${it.title}, from your calendar`}>{row}</View>
          );
        })}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New booking"
        onPress={() => {
          // Default to 9 AM on a future selected day, or the next half hour today.
          const start = key > today ? new Date(zoneDayStart(selected, zone).getTime() + 9 * 3600_000) : undefined;
          router.push(start ? { pathname: "/new-booking", params: { start: start.toISOString() } } : "/new-booking");
        }}
        style={({ pressed }) => [styles.fab, { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={30} color={t.primaryText} />
      </Pressable>
    </SafeAreaView>
  );
}

/** "11/02/2026" to "2026-11-02", to compare with all-day dates. */
function isoDay(key: string): string {
  const [m, d, y] = key.split("/");
  return `${y}-${m}-${d}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  month: { fontSize: 14, fontWeight: "600" },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  iconBtn: { borderWidth: 1, borderRadius: 999, width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  week: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 10 },
  day: { alignItems: "center", width: 42, paddingVertical: 6, borderRadius: 14 },
  dow: { fontSize: 12, fontWeight: "600" },
  dom: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  list: { padding: 16, paddingBottom: 120, gap: 10 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 48 },
  emptyText: { fontSize: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, overflow: "hidden" },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  when: { width: 72 },
  time: { fontSize: 15, fontWeight: "600" },
  timeEnd: { fontSize: 13, marginTop: 1 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 14, marginTop: 2 },
  fab: { position: "absolute", right: 20, bottom: 24, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
