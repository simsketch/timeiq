import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { type EventType, useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { colorFor, useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const LENGTHS = [15, 30, 45, 60, 90];

type Draft = { id: string | null; name: string; duration: number; location: string };

export default function EventTypes() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
    }, [load])
  );

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
    const body = JSON.stringify({ name, duration: draft.duration, location: draft.location.trim() || null });
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
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Label>Name</Label>
        <TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="Intro call" placeholderTextColor={t.muted} style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]} />
        <Label>Length</Label>
        <View style={styles.lengths}>
          {[...new Set([...LENGTHS, draft.duration])].sort((a, b) => a - b).map((m) => (
            <Pressable
              key={m}
              onPress={() => setDraft({ ...draft, duration: m })}
              style={[styles.length, { borderColor: draft.duration === m ? t.primary : t.border, backgroundColor: draft.duration === m ? t.primary : t.card }]}
            >
              <Text style={{ color: draft.duration === m ? t.primaryText : t.text, fontWeight: "600" }}>{m} min</Text>
            </Pressable>
          ))}
        </View>
        <Label>Meeting link or place</Label>
        <TextInput
          value={draft.location}
          onChangeText={(location) => setDraft({ ...draft, location })}
          placeholder="https://meet.google.com/… or an address"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>Goes on every invite for this event type.</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setDraft(null)} /></View>
          <View style={{ flex: 1 }}><Button title="Save" busy={saving} onPress={save} /></View>
        </View>
        {draft.id && (
          <Button title="Delete event type" kind="danger" onPress={() => { const e = types?.find((x) => x.id === draft.id); if (e) remove(e); }} />
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
              <View style={[styles.dot, { backgroundColor: colorFor(String(e.id)) }]} />
              <Pressable style={{ flex: 1 }} onPress={() => setDraft({ id: String(e.id), name: e.name, duration: e.duration, location: e.location ?? "" })}>
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
                <Pressable style={styles.action} onPress={() => setDraft({ id: String(e.id), name: e.name, duration: e.duration, location: e.location ?? "" })}>
                  <Ionicons name="create-outline" size={17} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: "600" }}>Edit</Text>
                </Pressable>
              </View>
            )}
          </Card>
        );
      })}

      {types && (
        <Button title="New event type" icon={<Ionicons name="add" size={20} color={t.primaryText} />} onPress={() => setDraft({ id: null, name: "", duration: 30, location: "" })} />
      )}
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
        Prices, reminders and booking rules are on timeiq.app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: "row", gap: 20, paddingLeft: 22 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  lengths: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  length: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
