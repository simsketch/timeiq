import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { type CalendarSource, useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { useTheme } from "@/lib/theme";

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
      await load();
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
            await load();
          } catch (e) {
            Alert.alert("Not removed", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
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

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={syncing === "all"} onRefresh={() => sync("all")} />}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!sources && !error && <ActivityIndicator style={{ marginTop: 24 }} />}

      {sources && sources.length === 0 && (
        <Notice>No calendars yet. Connect one so busy times never get booked over.</Notice>
      )}

      {sources && sources.length > 0 && (
        <Card style={{ paddingVertical: 4 }}>
          {sources.map((s, i) => {
            const kind = KIND[s.type] ?? KIND.ics_url;
            const failing = s.sync_status !== "ok";
            return (
              <View key={s.id} style={[styles.source, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
                <Ionicons name={kind.icon} size={20} color={t.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: failing ? t.danger : t.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                    {failing ? s.last_sync_error || "Sync is failing" : `${kind.name} · ${ago(s.last_synced_at)}`}
                  </Text>
                </View>
                <Pressable accessibilityLabel={`Sync ${s.name}`} hitSlop={8} onPress={() => sync(s.id)} disabled={!!syncing}>
                  {syncing === s.id ? <ActivityIndicator /> : <Ionicons name="refresh" size={20} color={t.primary} />}
                </Pressable>
                <Pressable accessibilityLabel={`Remove ${s.name}`} hitSlop={8} onPress={() => remove(s)}>
                  <Ionicons name="trash-outline" size={20} color={t.muted} />
                </Pressable>
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
            Apple, school, sports and work calendars usually offer a "subscribe" or ICS link.
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setAdding(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Add" busy={saving} onPress={addLink} /></View>
          </View>
        </Card>
      ) : (
        <Button title="Add a calendar link" icon={<Ionicons name="add" size={20} color={t.primaryText} />} onPress={() => setAdding(true)} />
      )}

      <Button
        title="Connect Google or Outlook"
        kind="secondary"
        icon={<Ionicons name="open-outline" size={18} color={t.text} />}
        onPress={async () => {
          await WebBrowser.openBrowserAsync(`${SITE_URL}/calendars`);
          load();
        }}
      />
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
        Google and Outlook connect on timeiq.app. They show up here once connected.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  source: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
