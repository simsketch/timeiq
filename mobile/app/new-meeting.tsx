import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { DateField } from "@/components/date-time-field";
import { Button, Chips, Input, Label, ToggleRow } from "@/components/ui";
import { useApi } from "@/lib/api";
import { type MeetingDetail, splitEmails } from "@/lib/group-meetings";
import { useTheme } from "@/lib/theme";

const LENGTHS = [15, 30, 45, 60, 90, 120];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function NewMeeting() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState("");
  const [duration, setDuration] = useState(30);
  const [start, setStart] = useState(() => isoDay(new Date()));
  const [end, setEnd] = useState(() => isoDay(new Date(Date.now() + 6 * 86_400_000)));
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [sendInvites, setSendInvites] = useState(true);
  const [saving, setSaving] = useState(false);
  const emails = splitEmails(people);

  async function create() {
    if (!title.trim()) return Alert.alert("Name the meeting", "For example: Project kickoff.");
    if (!emails.length) return Alert.alert("Add someone", "Type or paste at least one email address.");
    if (end < start) return Alert.alert("Check the dates", "The last day comes before the first.");
    setSaving(true);
    try {
      const m = await api<MeetingDetail>("/api/group-meetings", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          duration_minutes: duration,
          window_start: start,
          window_end: end,
          participants: emails.map((email) => ({ email })),
          note: note.trim() || null,
          location: location.trim() || null,
          send_invites: sendInvites,
        }),
      });
      router.replace({ pathname: "/meeting/[id]", params: { id: m.id } });
    } catch (e) {
      Alert.alert("Not created", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Label>What&apos;s it for?</Label>
        <Input value={title} onChangeText={setTitle} placeholder="Project kickoff" />
      </View>
      <View>
        <Label>Who&apos;s invited?</Label>
        <Input value={people} onChangeText={setPeople} placeholder="ana@example.com, sam@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" multiline />
        <Text style={[styles.hint, { color: t.muted }]}>
          {emails.length ? `${emails.length} ${emails.length === 1 ? "person" : "people"}, plus you. ` : ""}Your own calendar is included automatically.
        </Text>
      </View>
      <View>
        <Label>Length</Label>
        <Chips options={LENGTHS.map((m) => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} hr` }))} value={duration} onChange={setDuration} />
      </View>
      <View style={styles.dates}>
        <View style={{ flex: 1 }}>
          <Label>From</Label>
          <DateField value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v); }} minimum={isoDay(new Date())} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>To</Label>
          <DateField value={end} onChange={setEnd} minimum={start} />
        </View>
      </View>
      <View>
        <Label>Where (optional)</Label>
        <Input value={location} onChangeText={setLocation} placeholder="Zoom link, address or phone" autoCapitalize="none" />
      </View>
      <View>
        <Label>Note to everyone (optional)</Label>
        <Input value={note} onChangeText={setNote} multiline />
      </View>
      <ToggleRow title="Email everyone their link now" detail="Turn off to copy and send the links yourself." value={sendInvites} onChange={setSendInvites} />
      <Button title={sendInvites ? "Send invites" : "Create"} busy={saving} onPress={create} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 18, paddingBottom: 48 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  dates: { flexDirection: "row", gap: 12 },
});
