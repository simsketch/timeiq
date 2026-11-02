import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useSharedText } from "@/lib/shared-text";
import { useTheme } from "@/lib/theme";
import { fmt, timeOf } from "@/lib/time";
import { useMe } from "@/lib/use-me";

interface ImportResult {
  id: string;
  status: string;
  name: string | null;
  events: { title: string; starts_at: string; ends_at: string; is_all_day: boolean }[];
}

export default function Import() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [shared, clearShared] = useSharedText();
  const [text, setText] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    if (!shared) return;
    setText(shared);
    setResult(null);
    clearShared();
  }, [shared, clearShared]);

  useEffect(() => {
    api<{ address: string }>("/api/email-imports").then((r) => setAddress(r.address)).catch(() => undefined);
  }, [api]);

  async function run() {
    setBusy(true);
    setError(null);
    setUndone(false);
    try {
      setResult(await api<ImportResult>("/api/email-imports/text", { method: "POST", body: JSON.stringify({ text }) }));
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result) return;
    setBusy(true);
    try {
      await api(`/api/email-imports/${result.id}/undo`, { method: "POST" });
      setUndone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[styles.lead, { color: t.muted }]}>
          Paste a schedule (a team calendar, class times, an email) and the dates land on your TimeIQ calendar. You can also share text to TimeIQ from any app.
        </Text>
        <TextInput
          style={[styles.box, { borderColor: t.border, color: t.text, backgroundColor: t.card }]}
          value={text}
          onChangeText={setText}
          multiline
          placeholder={"Soccer practice Tuesdays 5–6pm through Dec 15\nGame Saturday Nov 14, 9am at Riverside Park"}
          placeholderTextColor={t.muted}
          accessibilityLabel="Schedule text"
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title="Paste" kind="secondary" onPress={async () => setText(await Clipboard.getStringAsync())} />
          </View>
          <View style={{ flex: 2 }}>
            <Button title="Add to my calendar" onPress={run} busy={busy && !result} disabled={!text.trim()} />
          </View>
        </View>
        {error && <Notice tone="error">{error}</Notice>}
        {result && (
          <Card style={{ gap: 10 }}>
            <Label>{undone ? "Removed" : `Added ${result.events.length} event${result.events.length === 1 ? "" : "s"}`}</Label>
            {result.events.slice(0, 12).map((e, i) => {
              const s = new Date(e.starts_at);
              return (
                <View key={i} style={{ opacity: undone ? 0.4 : 1 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{e.title}</Text>
                  <Text style={{ color: t.muted, fontSize: 14 }}>
                    {fmt(s, e.is_all_day ? "UTC" : zone, { weekday: "short", month: "short", day: "numeric" })}
                    {e.is_all_day ? " · all day" : ` · ${timeOf(s, zone)}`}
                  </Text>
                </View>
              );
            })}
            {result.events.length > 12 && <Text style={{ color: t.muted }}>and {result.events.length - 12} more</Text>}
            {!undone && result.events.length > 0 && <Button title="Undo" kind="secondary" onPress={undo} busy={busy} />}
          </Card>
        )}
        {address && (
          <Card>
            <Label>Or forward it</Label>
            <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>
              Forward any schedule email to{" "}
              <Text style={{ color: t.primary, fontWeight: "600" }} onPress={() => Clipboard.setStringAsync(address)} selectable>
                {address}
              </Text>{" "}
              and it lands here too. Tap the address to copy it.
            </Text>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  lead: { fontSize: 15, lineHeight: 21 },
  box: { minHeight: 160, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
});
