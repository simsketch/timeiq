import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { type MeetingSummary, whenLabel } from "@/lib/group-meetings";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

export default function Meetings() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMeetings(await api<MeetingSummary[]>("/api/group-meetings"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your group meetings.");
    }
    api<{ agent_address: string; enabled: boolean }>("/api/email-imports")
      .then((inbox) => setAgent(inbox.enabled ? inbox.agent_address : null))
      .catch(() => undefined);
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const badge = (m: MeetingSummary) =>
    m.status === "booked"
      ? { text: "Booked", bg: "#d1fae5", fg: "#065f46" }
      : m.status === "cancelled"
      ? { text: "Cancelled", bg: t.border, fg: t.muted }
      : { text: `${m.responded_count} of ${m.participant_count} answered`, bg: "#e0e7ff", fg: "#3730a3" };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityLabel="Find a time" hitSlop={10} onPress={() => router.push("/new-meeting")} style={{ paddingHorizontal: 12 }}>
              <Ionicons name="add" size={28} color={t.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          Find a time with several people. Everyone gets a link to tick the times that work, and you book the best one.
        </Text>

        {agent && (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>
              <Text style={{ fontWeight: "600" }}>Or just cc TimeIQ.</Text> Add this address to any email thread about meeting up. It
              replies with times, reads the answers and books when you say so.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                await Clipboard.setStringAsync(agent);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={styles.copy}
            >
              <Text style={{ color: t.text, fontFamily: "Menlo", fontSize: 13, flex: 1 }} selectable>{agent}</Text>
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={t.primary} />
            </Pressable>
          </Card>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {!meetings && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
        {meetings?.length === 0 && (
          <Notice>No group meetings yet. Add the people and a range of days, and TimeIQ collects everyone&apos;s availability for you.</Notice>
        )}

        {meetings?.map((m) => {
          const b = badge(m);
          return (
            <Pressable
              key={m.id}
              onPress={() => router.push({ pathname: "/meeting/[id]", params: { id: m.id } })}
              style={({ pressed }) => [styles.item, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>{m.title}</Text>
                <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>
                  {m.status === "booked" && m.starts_at
                    ? whenLabel(m.starts_at, m.duration_minutes, zone)
                    : `${m.duration_minutes} min · ${m.participant_count + 1} people`}
                  {m.source === "email" ? " · from email" : ""}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: b.bg }]}>
                <Text style={{ color: b.fg, fontSize: 12, fontWeight: "600" }}>{b.text}</Text>
              </View>
            </Pressable>
          );
        })}

        {meetings && <Button title="Find a time" icon={<Ionicons name="people-outline" size={19} color={t.primaryText} />} onPress={() => router.push("/new-meeting")} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  copy: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
});
