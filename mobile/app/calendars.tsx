import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice, readable, useSplit } from "@/components/ui";
import { ConnectCalendar, type Provider, useCalendarConnect } from "@/components/connect-calendar";
import { WeekCalendar, bookingItems, syncedItems } from "@/components/week-calendar";
import { type Booking, type CachedEvent, type CalendarSource, type EventType, useApi } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const KIND: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; name: string }> = {
  google: { icon: "logo-google", name: "Google" },
  microsoft: { icon: "logo-microsoft", name: "Outlook" },
  ics_url: { icon: "link-outline", name: "Calendar link" },
};

function ago(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Synced just now";
  if (mins < 60) return `Synced ${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `Synced ${h} h ago` : `Synced ${Math.round(h / 24)} d ago`;
}

export default function Calendars() {
  const t = useTheme();
  const api = useApi();
  const [sources, setSources] = useState<CalendarSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  // The ICS calendar whose link is being replaced, and the new link.
  const [replacing, setReplacing] = useState<string | null>(null);
  const [newLink, setNewLink] = useState("");
  const router = useRouter();
  const wide = useSplit();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // What the synced calendars hold, on a read-only calendar under the list.
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [events, setEvents] = useState<CachedEvent[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const onRangeChange = useCallback(
    (start: Date, end: Date) => setRange((cur) => (cur && cur.start === start.getTime() && cur.end === end.getTime() ? cur : { start: start.getTime(), end: end.getTime() })),
    []
  );
  const loadEvents = useCallback(async () => {
    if (!range) return;
    const q = `start=${encodeURIComponent(new Date(range.start).toISOString())}&end=${encodeURIComponent(new Date(range.end).toISOString())}`;
    try {
      const [cached, confirmed, pending, eventTypes] = await Promise.all([
        api<CachedEvent[]>(`/api/calendars/cached-events?${q}`),
        api<Booking[]>("/api/bookings?status=confirmed"),
        api<Booking[]>("/api/bookings?status=pending_payment"),
        api<EventType[]>("/api/event-types"),
      ]);
      setEvents(cached);
      setBookings([...confirmed, ...pending]);
      setTypes(Object.fromEntries(eventTypes.map((e) => [String(e.id), e.name])));
    } catch {
      setEvents([]);
    }
  }, [api, range]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the request
    loadEvents();
  }, [loadEvents]);
  const calItems = useMemo(() => [...syncedItems(events), ...bookingItems(bookings, types)], [events, bookings, types]);

  const load = useCallback(async () => {
    try {
      setSources(await api<CalendarSource[]>("/api/calendars"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your calendars.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function sync(id: string | "all") {
    setSyncing(id);
    try {
      await api(id === "all" ? "/api/calendars/sync-all" : `/api/calendars/${id}/sync`, { method: "POST" });
      await Promise.all([load(), loadEvents()]);
    } catch (e) {
      Alert.alert("Sync failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSyncing(null);
    }
  }

  function remove(s: CalendarSource) {
    Alert.alert(`Remove ${s.name}?`, "Its events stop blocking your booking times. You can add it again later.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/api/calendars/${s.id}`, { method: "DELETE" });
            await Promise.all([load(), loadEvents()]);
          } catch (e) {
            Alert.alert("Not removed", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  const reconnect = useCalendarConnect(() => {
    load();
    loadEvents();
  });

  async function replaceLink(id: string) {
    const link = newLink.trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https?:\/\//i.test(link)) return Alert.alert("Check the link", "Paste the calendar's ICS link. It starts with https:// or webcal://.");
    setSaving(true);
    try {
      await api(`/api/calendars/${id}`, { method: "PATCH", body: JSON.stringify({ ics_url: link }) });
      setReplacing(null);
      setNewLink("");
      await Promise.all([load(), loadEvents()]);
    } catch (e) {
      Alert.alert("That link didn't work", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function addLink() {
    const link = url.trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https?:\/\//i.test(link)) return Alert.alert("Check the link", "Paste the calendar's ICS link. It starts with https:// or webcal://.");
    setSaving(true);
    try {
      await api("/api/calendars", { method: "POST", body: JSON.stringify({ name: name.trim() || "Calendar", ics_url: link }) });
      setAdding(false);
      setName("");
      setUrl("");
      await load();
    } catch (e) {
      Alert.alert("Not added", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Wide windows: calendars and their controls on the left, the synced week filling the right.
  const synced = sources && sources.length > 0 && (
        <View style={wide ? styles.calPane : { gap: 8 }}>
          {!wide && <Label>Synced events</Label>}
          <WeekCalendar
            items={calItems}
            zone={zone}
            gridHeight={wide ? undefined : 520}
            onRangeChange={onRangeChange}
            onSelect={(it) => router.push({ pathname: "/booking/[id]", params: { id: it.id } })}
          />
          <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>
            Each calendar has its own color. Tap a name above to show or hide it, or tap an event for its details.
          </Text>
        </View>
  );

  const controls = (
    <ScrollView
      style={wide && [styles.side, { borderColor: t.border }]}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={syncing === "all"} onRefresh={() => sync("all")} />}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!sources && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>
        Calendars sync every hour, and right away when you add one. When someone opens your booking page, any calendar more than 10 minutes out of date syncs first. Pull down to sync now.
      </Text>
      {!wide && synced}

      {sources && sources.length === 0 && (
        <Notice>No calendars yet. Connect one so busy times never get booked over.</Notice>
      )}

      {sources && sources.length > 0 && (
        <Card style={{ paddingVertical: 4 }}>
          {sources.map((s, i) => {
            const kind = KIND[s.type] ?? KIND.ics_url;
            const failing = s.sync_status !== "ok";
            return (
              <View key={s.id} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
              <View style={styles.source}>
                <Ionicons name={kind.icon} size={20} color={t.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: failing ? t.danger : t.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                    {failing ? s.last_sync_error || "Sync is failing" : `${kind.name} · ${ago(s.last_synced_at)}`}
                  </Text>
                </View>
                {failing && (s.type === "google" || s.type === "microsoft") && reconnect.enabled[s.type] && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => reconnect.connect(s.type as Provider)} disabled={!!reconnect.busy}>
                    {reconnect.busy === s.type ? <ActivityIndicator /> : <Text style={{ color: t.primary, fontWeight: "600" }}>Reconnect</Text>}
                  </Pressable>
                )}
                <Pressable accessibilityLabel={`Sync ${s.name}`} hitSlop={8} onPress={() => sync(s.id)} disabled={!!syncing}>
                  {syncing === s.id ? <ActivityIndicator /> : <Ionicons name="refresh" size={20} color={t.primary} />}
                </Pressable>
                {s.type === "ics_url" && (
                  <Pressable accessibilityLabel={`Replace the link for ${s.name}`} hitSlop={8} onPress={() => { setReplacing(replacing === s.id ? null : s.id); setNewLink(""); }}>
                    <Ionicons name="link-outline" size={20} color={failing ? t.danger : t.muted} />
                  </Pressable>
                )}
                <Pressable accessibilityLabel={`Remove ${s.name}`} hitSlop={8} onPress={() => remove(s)}>
                  <Ionicons name="trash-outline" size={20} color={t.muted} />
                </Pressable>
              </View>
              {replacing === s.id && (
                <View style={{ gap: 8, paddingBottom: 12 }}>
                  <TextInput
                    placeholder="New https://… or webcal://… link"
                    placeholderTextColor={t.muted}
                    value={newLink}
                    onChangeText={setNewLink}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    keyboardType="url"
                    style={[styles.input, { color: t.text, borderColor: t.border }]}
                  />
                  <Button title="Replace link" busy={saving} onPress={() => replaceLink(s.id)} />
                </View>
              )}
              </View>
            );
          })}
        </Card>
      )}

      {sources && sources.length > 1 && (
        <Button title="Sync all" kind="secondary" busy={syncing === "all"} onPress={() => sync("all")} icon={<Ionicons name="refresh" size={18} color={t.text} />} />
      )}

      {adding ? (
        <Card style={{ gap: 10 }}>
          <Label>Add a calendar link</Label>
          <TextInput placeholder="Name (e.g. Kids' school)" placeholderTextColor={t.muted} value={name} onChangeText={setName} style={[styles.input, { color: t.text, borderColor: t.border }]} />
          <TextInput
            placeholder="https://… or webcal://…"
            placeholderTextColor={t.muted}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: t.text, borderColor: t.border }]}
          />
          <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>
            Apple, school, sports and work calendars usually offer a &quot;subscribe&quot; or ICS link.
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setAdding(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Add" busy={saving} onPress={addLink} /></View>
          </View>
        </Card>
      ) : (
        <Button title="Add a calendar link" icon={<Ionicons name="add" size={20} color={t.primaryText} />} onPress={() => setAdding(true)} />
      )}

      <ConnectCalendar onConnected={() => Promise.all([load(), loadEvents()])} />

    </ScrollView>
  );

  return wide ? (
    <View style={styles.split}>
      {controls}
      {synced}
    </View>
  ) : (
    controls
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48, ...readable },
  split: { flex: 1, flexDirection: "row" },
  side: { width: 380, flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  calPane: { flex: 1, padding: 16, paddingBottom: 32, gap: 8 },
  source: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
