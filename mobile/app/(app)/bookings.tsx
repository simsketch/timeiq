import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Notice, Segmented } from "@/components/ui";
import { type Booking, type EventType, useApi } from "@/lib/api";
import { colorFor, useTheme } from "@/lib/theme";
import { dayKey, fmt, timeOf } from "@/lib/time";
import { useMe } from "@/lib/use-me";

type Tab = "upcoming" | "pending" | "past" | "cancelled";

export default function Bookings() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [tab, setTab] = useState<Tab>("upcoming");
  const [all, setAll] = useState<Booking[] | null>(null);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bookings, ets] = await Promise.all([api<Booking[]>("/api/bookings"), api<EventType[]>("/api/event-types")]);
      setAll(bookings);
      setTypes(Object.fromEntries(ets.map((e) => [String(e.id), e.name])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your bookings.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const now = Date.now();
  const shown = useMemo(() => {
    if (!all) return [];
    // A move cancels the old booking and creates a new one; hide the old half.
    const replaced = new Set(all.map((b) => b.rescheduled_from_id).filter(Boolean));
    const list = all.filter((b) => {
      const ended = new Date(b.ends_at).getTime() < now;
      if (tab === "upcoming") return b.status === "confirmed" && !ended;
      if (tab === "pending") return b.status === "pending_payment";
      if (tab === "past") return b.status === "completed" || (b.status === "confirmed" && ended);
      return b.status === "cancelled" && !replaced.has(b.id);
    });
    return tab === "upcoming" || tab === "pending" ? list : list.reverse();
  }, [all, tab, now]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Booking[] }[] = [];
    for (const b of shown) {
      const d = new Date(b.starts_at);
      const key = dayKey(d, zone);
      if (out[out.length - 1]?.key !== key) out.push({ key, label: fmt(d, zone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }), items: [] });
      out[out.length - 1].items.push(b);
    }
    return out;
  }, [shown, zone]);

  const empty: Record<Tab, string> = {
    upcoming: "No upcoming bookings. Share your booking link, or tap + to book someone yourself.",
    pending: "Nothing waiting on payment.",
    past: "No past bookings yet.",
    cancelled: "No cancelled bookings.",
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityLabel="New booking" hitSlop={10} onPress={() => router.push("/new-booking")} style={{ paddingHorizontal: 12 }}>
              <Ionicons name="add" size={28} color={t.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "pending", label: "Unpaid" },
            { value: "past", label: "Past" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        {error && <Notice tone="error">{error}</Notice>}
        {!all && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
        {all && shown.length === 0 && <Notice>{empty[tab]}</Notice>}

        {groups.map((g) => (
          <View key={g.key} style={{ gap: 8 }}>
            <Text style={[styles.day, { color: t.muted }]}>{g.label}</Text>
            {g.items.map((b) => {
              const start = new Date(b.starts_at);
              const end = new Date(b.ends_at);
              const extra = b.guest_emails?.length ? ` +${b.guest_emails.length}` : "";
              return (
                <Pressable
                  key={b.id}
                  onPress={() => router.push({ pathname: "/booking/[id]", params: { id: b.id } })}
                  style={({ pressed }) => [styles.item, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={[styles.bar, { backgroundColor: colorFor(b.event_type_id) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
                      {b.visitor_name}{extra}
                    </Text>
                    <Text style={{ color: t.muted, fontSize: 14, marginTop: 2 }} numberOfLines={1}>
                      {timeOf(start, zone)} – {timeOf(end, zone)} · {types[b.event_type_id] ?? "Meeting"}
                      {b.price_cents ? ` · ${(b.price_cents / 100).toLocaleString("en-US", { style: "currency", currency: b.currency.toUpperCase() })}` : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.muted} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  day: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  bar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
});
