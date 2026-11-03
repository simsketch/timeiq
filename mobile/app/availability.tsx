import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Button, Card, Notice } from "@/components/ui";
import { type AvailabilityRule, useApi } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const defaults = (): AvailabilityRule[] =>
  DAYS.map((_, i) => ({ day_of_week: i, start_time: "09:00:00", end_time: "17:00:00", is_active: i < 5 }));

/** "09:30:00" ↔ a Date on an arbitrary day, for the time picker. */
const toDate = (hms: string) => {
  const [h, m] = hms.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d;
};
const toHms = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
const label = (hms: string) =>
  toDate(hms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function Availability() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ day: number; field: "start_time" | "end_time" } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api<AvailabilityRule[]>("/api/availability-rules");
      const byDay = new Map(data.map((r) => [r.day_of_week, r]));
      // Days with no rule show as off, with default hours ready if switched on.
      setRules(data.length ? defaults().map((d) => byDay.get(d.day_of_week) ?? { ...d, is_active: false }) : defaults());
      setDirty(data.length === 0);
    } catch (e) {
      // Never fall back to defaults here: saving them would overwrite real hours.
      setLoadError(e instanceof Error ? e.message : "Couldn't load your hours.");
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  function update(day: number, patch: Partial<AvailabilityRule>) {
    setRules((rs) => rs && rs.map((r) => (r.day_of_week === day ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  async function save() {
    if (!rules) return;
    const bad = rules.find((r) => r.is_active && r.end_time <= r.start_time);
    if (bad) return Alert.alert("Check your hours", `${DAYS[bad.day_of_week]} ends before it starts.`);
    setSaving(true);
    try {
      await api("/api/availability-rules", { method: "PUT", body: JSON.stringify({ rules }) });
      setDirty(false);
    } catch (e) {
      Alert.alert("Not saved", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError)
    return (
      <View style={styles.page}>
        <Notice tone="error">{loadError}</Notice>
        <Button title="Try again" kind="secondary" onPress={load} />
      </View>
    );
  if (!rules) return <ActivityIndicator style={{ marginTop: 40 }} />;

  const editingRule = editing && rules.find((r) => r.day_of_week === editing.day);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
        The hours people can book you, in {(me?.timezone ?? "your time zone").replace(/_/g, " ")}. Busy times on your calendars are left out automatically.
      </Text>
      <Card style={{ paddingVertical: 4 }}>
        {rules.map((r, i) => (
          <View key={r.day_of_week} style={[styles.day, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
            <Switch value={r.is_active} onValueChange={(v) => update(r.day_of_week, { is_active: v })} trackColor={{ true: t.primary }} />
            <Text style={[styles.dayName, { color: r.is_active ? t.text : t.muted }]}>{DAYS[r.day_of_week].slice(0, 3)}</Text>
            {r.is_active ? (
              <View style={styles.times}>
                <TimeChip text={label(r.start_time)} active={editing?.day === r.day_of_week && editing.field === "start_time"} onPress={() => setEditing({ day: r.day_of_week, field: "start_time" })} />
                <Text style={{ color: t.muted }}>–</Text>
                <TimeChip text={label(r.end_time)} active={editing?.day === r.day_of_week && editing.field === "end_time"} onPress={() => setEditing({ day: r.day_of_week, field: "end_time" })} />
              </View>
            ) : (
              <Text style={{ color: t.muted, flex: 1, textAlign: "right" }}>Unavailable</Text>
            )}
          </View>
        ))}
      </Card>

      {editing && editingRule && (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: t.text, fontWeight: "600" }}>
            {DAYS[editing.day]} · {editing.field === "start_time" ? "Start" : "End"}
          </Text>
          <DateTimePicker
            value={toDate(editingRule[editing.field])}
            mode="time"
            minuteInterval={15}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(e, d) => {
              if (Platform.OS === "android") setEditing(null);
              if (e.type === "set" || Platform.OS === "ios") d && update(editing.day, { [editing.field]: toHms(d) });
            }}
          />
          {Platform.OS === "ios" && <Button title="Done" kind="secondary" onPress={() => setEditing(null)} />}
        </Card>
      )}

      <Button title={dirty ? "Save hours" : "Saved"} onPress={save} busy={saving} disabled={!dirty} />
    </ScrollView>
  );
}

function TimeChip({ text, onPress, active }: { text: string; onPress: () => void; active: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { borderColor: active ? t.primary : t.border, backgroundColor: t.bg }]}>
      <Text style={{ color: t.text, fontSize: 15, fontVariant: ["tabular-nums"] }}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  day: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  dayName: { width: 40, fontSize: 16, fontWeight: "600" },
  times: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
