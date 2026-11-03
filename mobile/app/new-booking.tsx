import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DateTimeField } from "@/components/date-time-field";
import { Button, Label, Notice } from "@/components/ui";
import { ApiError, type EventType, useApi } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { fmt, nextHalfHour, timeOf } from "@/lib/time";
import { useMe } from "@/lib/use-me";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewBooking() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // A tapped or dragged calendar slot opens this pre-filled: `start` (ISO) and, for a drag, `minutes`.
  const params = useLocalSearchParams<{ start?: string; minutes?: string }>();
  const [start, setStart] = useState(() => (params.start ? new Date(params.start) : nextHalfHour()));
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(() => (params.minutes && Number(params.minutes) > 0 ? String(Math.round(Number(params.minutes))) : ""));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<EventType[]>("/api/event-types")
      .then((all) => {
        const list = [...all].sort((a, b) => Number(b.is_active) - Number(a.is_active));
        setTypes(list);
        if (list[0]) setTypeId(String(list[0].id));
      })
      .catch((e) => {
        setTypes([]);
        setError(e instanceof Error ? e.message : "Couldn't load your event types.");
      });
  }, [api]);

  const type = types?.find((x) => String(x.id) === typeId);
  const length = Number(minutes) || type?.duration || 30;
  const guestList = guests.split(/[\s,;]+/).filter(Boolean);
  const end = new Date(start.getTime() + length * 60_000);

  async function submit(allowConflict = false) {
    if (!type) return;
    if (!name.trim()) return setError("Add the guest's name.");
    if (!EMAIL.test(email.trim())) return setError("Add the guest's email address.");
    const bad = guestList.find((g) => !EMAIL.test(g));
    if (bad) return setError(`${bad} isn't an email address.`);
    if (start.getTime() < Date.now() - 5 * 60_000) return setError("Pick a time that hasn't passed yet.");
    setSaving(true);
    setError(null);
    try {
      await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          event_type_id: type.id,
          visitor_name: name.trim(),
          visitor_email: email.trim(),
          visitor_notes: notes.trim() || null,
          guest_emails: guestList,
          duration_minutes: minutes ? length : null,
          starts_at: start.toISOString(),
          timezone: zone,
          allow_conflict: allowConflict,
        }),
      });
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : "The booking didn't save.";
      if (e instanceof ApiError && e.status === 409) {
        Alert.alert("This time overlaps", message.replace(/^This time overlaps: /, ""), [
          { text: "Pick another time", style: "cancel" },
          { text: "Book anyway", onPress: () => submit(true) },
        ]);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  const input = [styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.card }];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {types && types.length === 0 && !error && (
          <Notice>Create an event type on timeiq.app first. It sets the meeting length and link.</Notice>
        )}
        {!!types?.length && (
          <View>
            <Label>Event type</Label>
            <View style={styles.chips}>
              {types.map((x) => {
                const on = String(x.id) === typeId;
                return (
                  <Pressable
                    key={x.id}
                    onPress={() => setTypeId(String(x.id))}
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.card }]}
                  >
                    <Text style={{ color: on ? t.primaryText : t.text, fontWeight: "600" }}>
                      {x.name} · {x.duration}m
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {type && <Text style={[styles.hint, { color: t.muted }]}>{type.location ? `Where: ${type.location}` : "No meeting link set on this event type."}</Text>}
          </View>
        )}
        <View>
          <Label>When</Label>
          <DateTimeField value={start} onChange={setStart} zone={zone} />
          <Text style={[styles.hint, { color: t.muted }]}>
            {fmt(start, zone, { weekday: "short", month: "short", day: "numeric" })} · {timeOf(start, zone)} – {timeOf(end, zone)} · {zone.replace(/_/g, " ")}
          </Text>
        </View>
        <View>
          <Label>Minutes</Label>
          <TextInput style={input} keyboardType="number-pad" value={minutes} onChangeText={setMinutes} placeholder={String(type?.duration ?? 30)} placeholderTextColor={t.muted} />
        </View>
        <View>
          <Label>Guest name</Label>
          <TextInput style={input} value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" placeholderTextColor={t.muted} />
        </View>
        <View>
          <Label>Guest email</Label>
          <TextInput style={input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" autoCorrect={false} />
        </View>
        <View>
          <Label>Other guests (optional)</Label>
          <TextInput style={input} value={guests} onChangeText={setGuests} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} placeholder="bea@example.com, cy@example.com" placeholderTextColor={t.muted} />
        </View>
        <View>
          <Label>Note (optional)</Label>
          <TextInput style={[input, { minHeight: 80, textAlignVertical: "top" }]} value={notes} onChangeText={setNotes} multiline />
        </View>
        {error && <Notice tone="error">{error}</Notice>}
        <Button title="Book and send invite" onPress={() => submit(false)} busy={saving} disabled={!type} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: { padding: 20, gap: 18, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  hint: { fontSize: 13, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
