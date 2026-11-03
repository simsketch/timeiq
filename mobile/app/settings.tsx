import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Input, Label, Row, ToggleRow } from "@/components/ui";
import { type BillingStatus, type Me, useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { useTheme } from "@/lib/theme";
import { rememberMe, useMe } from "@/lib/use-me";

const SCENES: { id: string; name: string; still?: string }[] = [
  { id: "soft-watches", name: "Soft watches", still: "desert" },
  { id: "time-machine", name: "The Time Machine", still: "time-machine" },
  { id: "sanctum", name: "Sanctum", still: "sanctum" },
  { id: "orrery", name: "Orrery", still: "orrery" },
  { id: "solstice", name: "Solstice", still: "solstice" },
  { id: "maya", name: "Maya calendar", still: "maya" },
  { id: "world-clocks", name: "Wall of clocks", still: "world-clocks" },
  { id: "atomic", name: "Atomic clock", still: "atomic" },
  { id: "lava-lamp", name: "Lava lamp lounge", still: "lava-lamp" },
  { id: "digital-rain", name: "Digital rain", still: "digital-rain" },
  { id: "random", name: "Random" },
  { id: "none", name: "No scene" },
];

const COMMON_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
  "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "America/Mexico_City", "America/Sao_Paulo", "America/Bogota",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "Europe/Amsterdam", "Europe/Stockholm", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow", "Africa/Cairo",
  "Africa/Johannesburg", "Africa/Lagos", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Seoul", "Asia/Tokyo", "Australia/Perth", "Australia/Sydney",
  "Pacific/Auckland", "UTC",
];

function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list.includes("UTC") ? list : [...list, "UTC"];
  } catch {
    // Older engines lack supportedValuesOf; the common list covers most people.
  }
  return COMMON_ZONES;
}

type Feed = { url: string; webcal_url: string; obfuscate: boolean };

export default function Settings() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const [name, setName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zonePicker, setZonePicker] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Feed>("/api/me/feed").then(setFeed).catch(() => undefined);
      api<BillingStatus>("/api/billing/status").then(setBilling).catch(() => undefined);
    }, [api])
  );

  // Save one or more profile fields and share the result with every screen.
  async function patch(body: Partial<Me>, failTitle = "Not saved") {
    try {
      const next = await api<Me>("/api/me", { method: "PATCH", body: JSON.stringify(body) });
      rememberMe({ ...me!, ...next });
      return true;
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : "Try again.");
      return false;
    }
  }

  const dirty =
    me && ((name ?? me.name ?? "") !== (me.name ?? "") || (username ?? me.username) !== me.username || (target !== null && Number(target) !== me.weekly_hours_target));

  async function saveProfile() {
    if (!me) return;
    setSaving(true);
    const body: Partial<Me> = {};
    if (name !== null) body.name = name.trim();
    if (username !== null && username.trim().toLowerCase() !== me.username) body.username = username.trim().toLowerCase();
    if (target !== null) body.weekly_hours_target = Math.max(0, Math.min(168, Number(target) || 0));
    if (await patch(body)) {
      setName(null);
      setUsername(null);
      setTarget(null);
    }
    setSaving(false);
  }

  async function setObfuscate(obfuscate: boolean) {
    if (!feed) return;
    setFeed({ ...feed, obfuscate });
    try {
      setFeed(await api<Feed>("/api/me/feed", { method: "PATCH", body: JSON.stringify({ obfuscate }) }));
    } catch (e) {
      setFeed({ ...feed, obfuscate: !obfuscate });
      Alert.alert("Not changed", e instanceof Error ? e.message : "Try again.");
    }
  }

  function regenerate() {
    Alert.alert("Make a new link?", "The old link stops working in any calendar that uses it.", [
      { text: "Keep the old one", style: "cancel" },
      {
        text: "New link",
        style: "destructive",
        onPress: async () => {
          try {
            setFeed(await api<Feed>("/api/me/feed/regenerate", { method: "POST" }));
          } catch (e) {
            Alert.alert("Not changed", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  async function manageBilling() {
    try {
      const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      await WebBrowser.openBrowserAsync(url);
      api<BillingStatus>("/api/billing/status").then(setBilling).catch(() => undefined);
    } catch (e) {
      Alert.alert("Couldn't open billing", e instanceof Error ? e.message : "Try again.");
    }
  }

  if (!me) return <ActivityIndicator style={{ marginTop: 40 }} />;
  const scene = me.booking_scene ?? "soft-watches";

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Label>Profile</Label>
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={[styles.field, { color: t.text }]}>Display name</Text>
          <Input value={name ?? me.name ?? ""} onChangeText={setName} placeholder="Your full name" />
          <Text style={[styles.hint, { color: t.muted }]}>Shown to guests in emails and calendar invites.</Text>
        </View>
        <View>
          <Text style={[styles.field, { color: t.text }]}>Booking link</Text>
          <View style={styles.prefixRow}>
            <Text style={{ color: t.muted, fontSize: 15 }}>timeiq.app/book/</Text>
            <Input style={{ flex: 1 }} value={username ?? me.username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          </View>
          <Text style={[styles.hint, { color: t.muted }]}>Letters, numbers, - and _. Changing it breaks links you&apos;ve already shared.</Text>
        </View>
        {me.invoicing_enabled && (
          <View>
            <Text style={[styles.field, { color: t.text }]}>Weekly hours target</Text>
            <Input value={target ?? String(me.weekly_hours_target ?? 40)} onChangeText={setTarget} keyboardType="number-pad" style={{ width: 100 }} />
          </View>
        )}
        {dirty && <Button title="Save" busy={saving} onPress={saveProfile} />}
        <Row icon="globe-outline" title="Time zone" detail={me.timezone.replace(/_/g, " ")} onPress={() => setZonePicker(true)} />
      </Card>

      <Label>Email</Label>
      <Card style={{ paddingVertical: 6 }}>
        <ToggleRow
          title="Your week email"
          detail="Your bookings and open time every Monday around 7 am."
          value={me.weekly_summary_enabled ?? true}
          onChange={(v) => patch({ weekly_summary_enabled: v }, "Not changed")}
        />
        <Row icon="mail-outline" title="Linked email addresses" detail="Other addresses that can forward schedules and cc TimeIQ" onPress={() => router.push("/email-addresses")} />
      </Card>

      <Label>Booking page scene</Label>
      <View style={styles.scenes}>
        {SCENES.map((s) => {
          const on = s.id === scene;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => !on && patch({ booking_scene: s.id }, "Scene not changed")}
              style={[styles.scene, { borderColor: on ? t.primary : t.border, backgroundColor: t.card }]}
            >
              {s.still ? (
                <Image source={{ uri: `${SITE_URL}/booking/${s.still}-still-640.webp` }} style={styles.still} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.still, styles.stillEmpty, { backgroundColor: t.border }]}>
                  <Ionicons name={s.id === "random" ? "shuffle" : "remove-circle-outline"} size={26} color={t.muted} />
                </View>
              )}
              <View style={styles.sceneName}>
                <Text style={{ color: t.text, fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>{s.name}</Text>
                {on && <Ionicons name="checkmark-circle" size={16} color={t.primary} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Label>Calendar subscription</Label>
      <Card style={{ gap: 12 }}>
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
          A read-only feed of your bookings and synced events, for Google Calendar, Apple Calendar or any app that takes a calendar link.
        </Text>
        {feed ? (
          <>
            <Text style={{ color: t.text, fontFamily: "Menlo", fontSize: 12 }} selectable numberOfLines={2}>{feed.url}</Text>
            <View style={styles.buttons}>
              <View style={{ flex: 1 }}>
                <Button title="Add to Calendar" onPress={() => Linking.openURL(feed.webcal_url).catch(() => Alert.alert("No calendar app", "Copy the link and add it as a subscription instead."))} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={copied ? "Copied" : "Copy"}
                  kind="secondary"
                  onPress={async () => {
                    await Clipboard.setStringAsync(feed.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                />
              </View>
            </View>
            <ToggleRow title="Hide event names" detail="The feed shows only busy times, with no titles, places or attendees." value={feed.obfuscate} onChange={setObfuscate} />
            <Pressable onPress={regenerate} style={{ paddingVertical: 4 }}>
              <Text style={{ color: t.danger, fontWeight: "600" }}>Make a new link</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </Card>

      {billing?.enabled && (
        <>
          <Label>Billing</Label>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: t.text, fontSize: 16 }}>
              {billing.status === "complimentary"
                ? "Complimentary plan"
                : billing.subscribed
                ? billing.plan === "founder"
                  ? "Founding member"
                  : "Standard plan"
                : billing.free_meetings_left !== null
                ? `${billing.free_meetings_left} of ${billing.free_meetings} free meetings left`
                : "No plan"}
            </Text>
            {billing.current_period_end && (
              <Text style={{ color: t.muted, fontSize: 14 }}>
                {billing.status === "canceled" ? "Access until " : "Renews "}
                {new Date(billing.current_period_end).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </Text>
            )}
            {billing.has_customer ? (
              <Button title="Manage billing" kind="secondary" onPress={manageBilling} />
            ) : billing.status !== "complimentary" ? (
              <Button title="See plans" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/pricing`)} />
            ) : null}
          </Card>
        </>
      )}

      <Label>Developers and data</Label>
      <Card style={{ paddingVertical: 6 }}>
        <Row icon="key-outline" title="API tokens and connected apps" detail="Claude, ChatGPT and scripts that use your account" onPress={() => router.push("/api-tokens")} />
        <Row icon="download-outline" title="Export your data" detail="A zip of CSV files, on timeiq.app" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/settings`)} />
      </Card>

      <ZonePicker
        visible={zonePicker}
        current={me.timezone}
        onClose={() => setZonePicker(false)}
        onPick={async (zone) => {
          setZonePicker(false);
          if (zone !== me.timezone) await patch({ timezone: zone }, "Time zone not changed");
        }}
      />
    </ScrollView>
  );
}

function ZonePicker({ visible, current, onClose, onPick }: { visible: boolean; current: string; onClose: () => void; onPick: (zone: string) => void }) {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const zones = useMemo(allZones, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "_");
    return q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
  }, [query, zones]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
        <View style={styles.sheetHead}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Time zone</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: t.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Input value={query} onChangeText={setQuery} placeholder="Search, e.g. London" autoCorrect={false} clearButtonMode="while-editing" />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(z) => z}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} style={({ pressed }) => [styles.zone, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>{item.replace(/_/g, " ")}</Text>
              {item === current && <Ionicons name="checkmark" size={20} color={t.primary} />}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 48 },
  field: { fontSize: 15, fontWeight: "600", marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  prefixRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scenes: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  scene: { width: "48%", flexGrow: 1, borderWidth: 2, borderRadius: 14, overflow: "hidden" },
  still: { width: "100%", aspectRatio: 16 / 10 },
  stillEmpty: { alignItems: "center", justifyContent: "center" },
  sceneName: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  buttons: { flexDirection: "row", gap: 10 },
  sheetHead: { flexDirection: "row", alignItems: "center", padding: 16 },
  zone: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
