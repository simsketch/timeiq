import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from "react-native";
import { Button, Card, Chips, Input, Label, Notice, ToggleRow } from "@/components/ui";
import { type EventType, useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { colorFor, type Theme, useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const LENGTHS = [15, 30, 45, 60, 90];
const COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];
const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "chf", "sgd", "hkd"];
const REMINDERS = [{ value: 1440, label: "1 day before" }, { value: 60, label: "1 hour before" }, { value: 15, label: "15 min before" }];

type Draft = {
  id: string | null;
  name: string;
  duration: number;
  location: string;
  description: string;
  color: string;
  buffer_time: number;
  max_bookings_per_day: number | null;
  min_notice_minutes: number;
  max_days_ahead: number | null;
  reminder_minutes: number[];
  remind_host: boolean;
  collect_phone: boolean;
  require_phone: boolean;
  collect_company: boolean;
  require_company: boolean;
  collect_url: boolean;
  require_url: boolean;
  price: string;
  currency: string;
};

function draftOf(e?: EventType): Draft {
  return {
    id: e ? String(e.id) : null,
    name: e?.name ?? "",
    duration: e?.duration ?? 30,
    location: e?.location ?? "",
    description: e?.description ?? "",
    color: e?.color ?? COLORS[0],
    buffer_time: e?.buffer_time ?? 0,
    max_bookings_per_day: e?.max_bookings_per_day ?? null,
    min_notice_minutes: e?.min_notice_minutes ?? 0,
    max_days_ahead: e?.max_days_ahead ?? null,
    reminder_minutes: e?.reminder_minutes ?? [1440],
    remind_host: e?.remind_host ?? false,
    collect_phone: e?.collect_phone ?? false,
    require_phone: e?.require_phone ?? false,
    collect_company: e?.collect_company ?? false,
    require_company: e?.require_company ?? false,
    collect_url: e?.collect_url ?? false,
    require_url: e?.require_url ?? false,
    price: e?.price_cents ? (e.price_cents / 100).toFixed(2) : "",
    currency: e?.currency ?? "usd",
  };
}

export default function EventTypes() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [payments, setPayments] = useState<"ready" | "needs_setup" | "off" | null>(null);

  const load = useCallback(async () => {
    try {
      setTypes(await api<EventType[]>("/api/event-types"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your event types.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
      api<{ enabled: boolean; status: string }>("/api/connect/status")
        .then((c) => setPayments(!c.enabled ? "off" : c.status === "ready" ? "ready" : "needs_setup"))
        .catch(() => setPayments("off"));
    }, [load, api])
  );

  async function setUpPayments() {
    try {
      const { url } = await api<{ url: string }>("/api/connect/onboarding", { method: "POST", body: JSON.stringify({ country: "US" }) });
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      Alert.alert("Couldn't open Stripe", e instanceof Error ? e.message : "Try again.");
    }
  }

  const linkFor = (e: EventType) => (me ? `${SITE_URL}/book/${me.username}/${e.slug}` : null);

  async function setActive(e: EventType, is_active: boolean) {
    setTypes((ts) => ts && ts.map((x) => (x.id === e.id ? { ...x, is_active } : x)));
    try {
      await api(`/api/event-types/${e.id}`, { method: "PATCH", body: JSON.stringify({ is_active }) });
    } catch (err) {
      setTypes((ts) => ts && ts.map((x) => (x.id === e.id ? { ...x, is_active: !is_active } : x)));
      Alert.alert("Not changed", err instanceof Error ? err.message : "Try again.");
    }
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return Alert.alert("Add a name", "For example: Intro call.");
    setSaving(true);
    const priced = draft.price.trim();
    const cents = priced ? Math.round(Number(priced) * 100) : null;
    if (cents !== null && (!Number.isFinite(cents) || cents < 50)) return Alert.alert("Check the price", "Use at least 0.50, or leave it empty for a free meeting.");
    if (cents !== null && payments !== "ready") return Alert.alert("Set up payments first", "Finish Stripe setup to charge for bookings, or leave the price empty.");
    const { id: _id, price: _price, ...fields } = draft;
    const body = JSON.stringify({
      ...fields,
      name,
      location: draft.location.trim() || null,
      description: draft.description.trim() || null,
      price_cents: cents,
      currency: draft.currency,
    });
    try {
      if (draft.id) {
        await api(`/api/event-types/${draft.id}`, { method: "PATCH", body });
      } else {
        await api("/api/event-types", { method: "POST", body });
      }
      setDraft(null);
      await load();
    } catch (e) {
      Alert.alert("Not saved", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  function remove(e: EventType) {
    Alert.alert(`Delete ${e.name}?`, "Its booking link stops working. Existing bookings stay.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/api/event-types/${e.id}`, { method: "DELETE" });
            setDraft(null);
            await load();
          } catch (err) {
            Alert.alert("Not deleted", err instanceof Error ? err.message : "Try again.");
          }
        },
      },
    ]);
  }

  if (draft) {
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    const ask = (field: "phone" | "company" | "url", title: string) => {
      const collect = `collect_${field}` as const;
      const require = `require_${field}` as const;
      return (
        <View key={field}>
          <ToggleRow title={title} value={draft[collect]} onChange={(v) => set({ [collect]: v, ...(!v && { [require]: false }) } as Partial<Draft>)} />
          {draft[collect] && <ToggleRow title="Required" value={draft[require]} onChange={(v) => set({ [require]: v } as Partial<Draft>)} />}
        </View>
      );
    };
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Label>Name</Label>
        <Input value={draft.name} onChangeText={(name) => set({ name })} placeholder="Intro call" />
        <Label>Length</Label>
        <Chips options={[...new Set([...LENGTHS, draft.duration])].sort((a, b) => a - b).map((m) => ({ value: m, label: `${m} min` }))} value={draft.duration} onChange={(duration) => set({ duration })} />
        <Label>Meeting link or place</Label>
        <Input value={draft.location} onChangeText={(location) => set({ location })} placeholder="Zoom, Google Meet, phone or an address" autoCapitalize="none" autoCorrect={false} />
        <Text style={hint(t)}>Goes on every invite for this event type.</Text>
        <Label>Description</Label>
        <Input value={draft.description} onChangeText={(description) => set({ description })} placeholder="What this meeting is for" multiline />
        <Label>Color</Label>
        <View style={styles.colors}>
          {COLORS.map((c) => (
            <Pressable key={c} accessibilityLabel={`Color ${c}`} accessibilityState={{ selected: draft.color === c }} onPress={() => set({ color: c })} style={[styles.swatch, { backgroundColor: c, borderColor: draft.color === c ? t.text : "transparent" }]} />
          ))}
        </View>

        <Label>Booking rules</Label>
        <Text style={sub(t)}>Minimum notice</Text>
        <Chips options={[0, 60, 240, 720, 1440, 2880].map((m) => ({ value: m, label: m ? `${m / 60} h` : "None" }))} value={draft.min_notice_minutes} onChange={(min_notice_minutes) => set({ min_notice_minutes })} />
        <Text style={sub(t)}>How far ahead</Text>
        <Chips options={[0, 7, 14, 30, 60, 90].map((d) => ({ value: d, label: d ? `${d} days` : "Any" }))} value={draft.max_days_ahead ?? 0} onChange={(d) => set({ max_days_ahead: d || null })} />
        <Text style={sub(t)}>Buffer between meetings</Text>
        <Chips options={[0, 5, 10, 15, 30, 60].map((m) => ({ value: m, label: m ? `${m} min` : "None" }))} value={draft.buffer_time} onChange={(buffer_time) => set({ buffer_time })} />
        <Text style={sub(t)}>Most bookings a day</Text>
        <Chips options={[0, 1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: n ? String(n) : "No limit" }))} value={draft.max_bookings_per_day ?? 0} onChange={(n) => set({ max_bookings_per_day: n || null })} />

        <Label>Reminders</Label>
        <Card style={{ paddingVertical: 4 }}>
          {REMINDERS.map((r) => (
            <ToggleRow
              key={r.value}
              title={r.label}
              value={draft.reminder_minutes.includes(r.value)}
              onChange={(on) => set({ reminder_minutes: on ? [...draft.reminder_minutes, r.value] : draft.reminder_minutes.filter((m) => m !== r.value) })}
            />
          ))}
          <ToggleRow title="Send reminders to me too" value={draft.remind_host} onChange={(remind_host) => set({ remind_host })} />
        </Card>

        <Label>Ask guests for</Label>
        <Card style={{ paddingVertical: 4 }}>
          {ask("phone", "Phone number")}
          {ask("company", "Company name")}
          {ask("url", "Website or LinkedIn")}
        </Card>

        <Label>Price</Label>
        {payments === "off" ? (
          <Text style={hint(t)}>Paid bookings aren&apos;t available right now.</Text>
        ) : (
          <>
            <View style={styles.priceRow}>
              <Input style={{ flex: 1 }} value={draft.price} onChangeText={(price) => set({ price })} placeholder="Free" keyboardType="decimal-pad" editable={payments === "ready"} />
            </View>
            {payments === "ready" && (
              <Chips options={CURRENCIES.map((c) => ({ value: c, label: c.toUpperCase() }))} value={draft.currency} onChange={(currency) => set({ currency })} />
            )}
            {payments === "needs_setup" ? (
              <Pressable onPress={setUpPayments}>
                <Text style={{ color: t.primary, fontWeight: "600" }}>Set up Stripe to charge for bookings</Text>
              </Pressable>
            ) : (
              <Text style={hint(t)}>Leave empty for free bookings. TimeIQ takes no platform fee.</Text>
            )}
          </>
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setDraft(null)} /></View>
          <View style={{ flex: 1 }}><Button title="Save" busy={saving} onPress={save} /></View>
        </View>
        {draft.id && (
          <Button title="Delete event type" kind="danger" onPress={() => { const e = types?.find((x) => String(x.id) === draft.id); if (e) remove(e); }} />
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {error && <Notice tone="error">{error}</Notice>}
      {!types && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
      {types?.length === 0 && <Notice>No event types yet. Add one, like a 30-minute intro call, and share its link.</Notice>}

      {types?.map((e) => {
        const link = linkFor(e);
        return (
          <Card key={e.id} style={{ gap: 10, opacity: e.is_active ? 1 : 0.6 }}>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: e.color ?? colorFor(String(e.id)) }]} />
              <Pressable style={{ flex: 1 }} onPress={() => setDraft(draftOf(e))}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: "600" }}>{e.name}</Text>
                <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                  {e.duration} min{e.location ? ` · ${e.location.replace(/^https?:\/\//, "")}` : ""}
                  {e.price_cents ? ` · paid` : ""}
                </Text>
              </Pressable>
              <Switch value={e.is_active} onValueChange={(v) => setActive(e, v)} trackColor={{ true: t.primary }} accessibilityLabel={`${e.name} bookable`} />
            </View>
            {link && e.is_active && (
              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => Share.share({ message: link, url: link })}>
                  <Ionicons name="share-outline" size={17} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: "600" }}>Share</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={async () => {
                    await Clipboard.setStringAsync(link);
                    setCopied(String(e.id));
                    setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  <Ionicons name={copied === String(e.id) ? "checkmark" : "copy-outline"} size={17} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: "600" }}>{copied === String(e.id) ? "Copied" : "Copy link"}</Text>
                </Pressable>
                <Pressable style={styles.action} onPress={() => setDraft(draftOf(e))}>
                  <Ionicons name="create-outline" size={17} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: "600" }}>Edit</Text>
                </Pressable>
              </View>
            )}
          </Card>
        );
      })}

      {types && (
        <Button title="New event type" icon={<Ionicons name="add" size={20} color={t.primaryText} />} onPress={() => setDraft(draftOf())} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: "row", gap: 20, paddingLeft: 22 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  colors: { flexDirection: "row", gap: 12 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  priceRow: { flexDirection: "row", gap: 10 },
});

const hint = (t: Theme) => ({ color: t.muted, fontSize: 13, lineHeight: 18 });
const sub = (t: Theme) => ({ color: t.text, fontSize: 15, fontWeight: "600" as const, marginTop: 4 });
