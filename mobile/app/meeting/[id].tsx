import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Button, Card, Input, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { type MeetingDetail, personLabel, whenLabel } from "@/lib/group-meetings";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const SHOWN = 8;

export default function Meeting() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const load = useCallback(async () => {
    try {
      setM(await api<MeetingDetail>(`/api/group-meetings/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That meeting doesn't exist, or it isn't yours.");
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function act(path: string, init: RequestInit, failTitle = "That didn't work") {
    setBusy(true);
    try {
      setM(await api<MeetingDetail>(path, init));
      return true;
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : "Try again.");
      load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    try {
      const r = await api<{ reminded: number }>(`/api/group-meetings/${id}/remind`, { method: "POST" });
      Alert.alert(r.reminded ? `Reminded ${r.reminded} ${r.reminded === 1 ? "person" : "people"}` : "Everyone has answered");
    } catch (e) {
      Alert.alert("Couldn't send reminders", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  function book(start: string) {
    Alert.alert(whenLabel(start, m!.duration_minutes, zone), "Everyone gets a calendar invite for this time.", [
      { text: "Back", style: "cancel" },
      { text: "Book and send invites", onPress: () => act(`/api/group-meetings/${id}/book`, { method: "POST", body: JSON.stringify({ starts_at: start }) }, "Not booked") },
    ]);
  }

  function cancel() {
    Alert.alert("Cancel this meeting?", m!.status === "booked" ? "Everyone's invite is withdrawn." : "People can no longer pick times.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel meeting", style: "destructive", onPress: () => act(`/api/group-meetings/${id}/cancel`, { method: "POST" }) },
    ]);
  }

  function remove() {
    Alert.alert("Delete this meeting?", "It disappears from your list. This can't be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/api/group-meetings/${id}`, { method: "DELETE" });
            router.back();
          } catch (e) {
            Alert.alert("Not deleted", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  if (error) return <View style={styles.page}><Notice tone="error">{error}</Notice></View>;
  if (!m) return <ActivityIndicator style={{ marginTop: 40 }} />;

  const total = m.participants.length;
  const waiting = m.participants.filter((p) => !p.responded).length;
  const slots = showAll ? m.slots : m.slots.slice(0, SHOWN);

  return (
    <>
      <Stack.Screen options={{ title: m.title }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.muted, fontSize: 15 }}>
          {m.duration_minutes} min · {total + 1} people{m.location ? ` · ${m.location}` : ""}
          {m.source === "email" ? " · started from an email thread" : ""}
          {m.source === "accepted" ? " · a time someone offered, accepted by TimeIQ" : ""}
        </Text>

        {m.status === "booked" && m.starts_at && (
          <Card style={{ gap: 4, borderColor: "#6ee7b7" }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "600" }}>{whenLabel(m.starts_at, m.duration_minutes, zone)}</Text>
            <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
              {m.source === "accepted"
                ? "Accepted on the email thread and held on your calendar. The other side sends the invite."
                : "Booked. Everyone got a calendar invite."}
            </Text>
          </Card>
        )}
        {m.status === "cancelled" && <Notice>This meeting was cancelled.</Notice>}

        {m.status === "open" && (
          <View style={{ gap: 8 }}>
            <Label>Best times</Label>
            {m.slots.length === 0 && (
              <Notice>You have no free time in this range. Check your hours under Availability, or cancel and pick other days.</Notice>
            )}
            {slots.map((s, i) => {
              const everyone = s.yes === total;
              return (
                <Pressable
                  key={s.start}
                  accessibilityRole="button"
                  onPress={() => book(s.start)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.slot,
                    { backgroundColor: t.card, borderColor: everyone ? "#34d399" : t.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{whenLabel(s.start, m.duration_minutes, zone)}</Text>
                    <Text style={{ color: t.muted, fontSize: 13 }}>
                      {everyone ? "Everyone can make it" : `${s.yes} of ${total} can make it`}
                      {s.pending > 0 ? ` · ${s.pending} waiting` : ""}
                      {i === 0 && !everyone && s.yes > 0 ? " · best so far" : ""}
                    </Text>
                    <View style={styles.answers}>
                      {m.participants.map((p) => {
                        const a = s.answers[p.id];
                        return (
                          <Ionicons
                            key={p.id}
                            accessibilityLabel={`${personLabel(p)}: ${a === true ? "can make it" : a === false ? "can't make it" : "hasn't answered"}`}
                            name={a === true ? "checkmark-circle" : a === false ? "close-circle" : "help-circle-outline"}
                            size={18}
                            color={a === true ? "#10b981" : a === false ? "#f43f5e" : t.muted}
                          />
                        );
                      })}
                    </View>
                  </View>
                  <Text style={{ color: t.primary, fontWeight: "600" }}>Book</Text>
                </Pressable>
              );
            })}
            {m.slots.length > SHOWN && (
              <Pressable onPress={() => setShowAll(!showAll)} style={{ paddingVertical: 6 }}>
                <Text style={{ color: t.primary, fontWeight: "600" }}>{showAll ? "Show fewer" : `Show all ${m.slots.length} times`}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Label>People</Label>
          <Card style={{ gap: 12 }}>
            <View style={styles.person}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "600" }}>You</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>Your calendars, live</Text>
              </View>
            </View>
            {m.participants.map((p) => (
              <View key={p.id} style={styles.person}>
                <Ionicons name={p.responded ? "checkmark-circle" : "help-circle-outline"} size={20} color={p.responded ? "#10b981" : t.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>{personLabel(p)}</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                    {p.uses_calendar ? "Shared their TimeIQ calendar" : p.responded ? "Picked times" : "Waiting"}
                    {p.name ? ` · ${p.email}` : ""}
                  </Text>
                </View>
                {m.status === "open" && (
                  <>
                    <Pressable
                      accessibilityLabel={`Share ${personLabel(p)}'s link`}
                      hitSlop={8}
                      onPress={() => Share.share({ message: p.link, url: p.link })}
                      onLongPress={() => Clipboard.setStringAsync(p.link)}
                    >
                      <Ionicons name="share-outline" size={20} color={t.primary} />
                    </Pressable>
                    {total > 1 && (
                      <Pressable
                        accessibilityLabel={`Remove ${personLabel(p)}`}
                        hitSlop={8}
                        disabled={busy}
                        onPress={() =>
                          Alert.alert(`Remove ${personLabel(p)}?`, undefined, [
                            { text: "Keep", style: "cancel" },
                            { text: "Remove", style: "destructive", onPress: () => act(`/api/group-meetings/${id}/participants/${p.id}`, { method: "DELETE" }) },
                          ])
                        }
                      >
                        <Ionicons name="close" size={20} color={t.muted} />
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            ))}
            {m.status === "open" && (
              <View style={styles.add}>
                <Input
                  style={{ flex: 1 }}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="Add someone by email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={async () => {
                    if (!newEmail.trim()) return;
                    if (await act(`/api/group-meetings/${id}/participants`, { method: "POST", body: JSON.stringify({ email: newEmail.trim() }) }, "Not added")) setNewEmail("");
                  }}
                />
              </View>
            )}
            {m.note ? <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>{m.note}</Text> : null}
          </Card>
        </View>

        {m.status === "open" && waiting > 0 && <Button title={`Remind ${waiting} ${waiting === 1 ? "person" : "people"}`} kind="secondary" busy={busy} onPress={remind} />}
        {m.status !== "cancelled" && <Button title="Cancel meeting" kind="secondary" disabled={busy} onPress={cancel} />}
        {m.status !== "booked" && <Button title="Delete meeting" kind="danger" disabled={busy} onPress={remove} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  slot: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  answers: { flexDirection: "row", gap: 4, marginTop: 4, flexWrap: "wrap" },
  person: { flexDirection: "row", alignItems: "center", gap: 12 },
  add: { flexDirection: "row", gap: 8, paddingTop: 4 },
});
