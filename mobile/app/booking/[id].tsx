import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { DateTimeField } from "@/components/date-time-field";
import { Button, Card, Label, Notice } from "@/components/ui";
import { ApiError, type Booking, type EventType, useApi } from "@/lib/api";
import { colorFor, useTheme } from "@/lib/theme";
import { fmt, timeOf } from "@/lib/time";
import { useMe } from "@/lib/use-me";

export default function BookingDetail() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [type, setType] = useState<EventType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api<Booking[]>("/api/bookings");
      // Follow a reschedule chain to the current booking.
      let b = all.find((x) => x.id === id) ?? null;
      for (let next = b && all.find((x) => x.rescheduled_from_id === b!.id); next; next = all.find((x) => x.rescheduled_from_id === b!.id)) b = next;
      setBooking(b);
      if (!b) return setError("This booking wasn't found.");
      const types = await api<EventType[]>("/api/event-types");
      setType(types.find((x) => String(x.id) === String(b!.event_type_id)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this booking.");
    }
  }, [api, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!booking) {
    return <View style={styles.center}>{error ? <Notice tone="warn">{error}</Notice> : <ActivityIndicator />}</View>;
  }

  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);
  const live = ["confirmed", "pending_payment"].includes(booking.status);
  const upcoming = live && start > new Date();

  function cancel() {
    Alert.alert("Cancel this booking?", `${booking!.visitor_name} gets a cancellation email.${booking!.price_cents != null ? " Paid bookings are refunded in full." : ""}`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/api/bookings/${booking!.id}`, { method: "PATCH" });
            router.back();
          } catch (e) {
            Alert.alert("Not cancelled", e instanceof Error ? e.message : "Try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function move(to: Date, allowConflict = false) {
    setBusy(true);
    try {
      const moved = await api<Booking>(`/api/bookings/${booking!.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ starts_at: to.toISOString(), allow_conflict: allowConflict }),
      });
      setMoving(null);
      setBooking(moved);
      Alert.alert("Moved", `${moved.visitor_name} got the updated invite.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The booking didn't move.";
      if (e instanceof ApiError && e.status === 409 && !allowConflict) {
        Alert.alert("This time overlaps", message.replace(/^This time overlaps: /, ""), [
          { text: "Pick another time", style: "cancel" },
          { text: "Move anyway", onPress: () => move(to, true) },
        ]);
      } else {
        Alert.alert("Not moved", message);
      }
    } finally {
      setBusy(false);
    }
  }

  const guestZone = booking.timezone && booking.timezone !== zone ? booking.timezone : null;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: booking.visitor_name }} />
      <Card>
        <View style={styles.titleRow}>
          <View style={[styles.swatch, { backgroundColor: colorFor(String(booking.event_type_id)) }]} />
          <Text style={[styles.type, { color: t.muted }]}>{type?.name ?? "Booking"}</Text>
          {booking.status !== "confirmed" && <Text style={[styles.status, { color: t.muted, borderColor: t.border }]}>{statusLabel(booking.status)}</Text>}
        </View>
        <Text style={[styles.name, { color: t.text }]}>{booking.visitor_name}</Text>
        <Text style={[styles.when, { color: t.text }]}>{fmt(start, zone, { weekday: "long", month: "long", day: "numeric" })}</Text>
        <Text style={[styles.time, { color: t.muted }]}>
          {timeOf(start, zone)} – {timeOf(end, zone)}
          {guestZone ? `  ·  ${timeOf(start, guestZone)} for them (${guestZone.replace(/_/g, " ")})` : ""}
        </Text>
        {type?.location && (
          <Text style={[styles.link, { color: t.primary }]} onPress={() => /^https?:/.test(type.location!) && Linking.openURL(type.location!)}>
            {type.location}
          </Text>
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        <Detail label="Email" value={booking.visitor_email} onPress={() => Linking.openURL(`mailto:${booking.visitor_email}`)} />
        {!!booking.guest_emails?.length && <Detail label="Other guests" value={booking.guest_emails.join(", ")} />}
        {booking.visitor_phone && <Detail label="Phone" value={booking.visitor_phone} onPress={() => Linking.openURL(`tel:${booking.visitor_phone}`)} />}
        {booking.visitor_company && <Detail label="Company" value={booking.visitor_company} />}
        {booking.visitor_notes && <Detail label="Note" value={booking.visitor_notes} />}
        {booking.price_cents != null && <Detail label="Paid" value={`${booking.currency.toUpperCase()} ${(booking.price_cents / 100).toFixed(2)}`} />}
      </Card>

      {upcoming && booking.status === "confirmed" && (
        moving ? (
          <Card style={{ gap: 12 }}>
            <Label>Move to</Label>
            <DateTimeField value={moving} onChange={setMoving} zone={zone} />
            <Button title="Move and send the new invite" onPress={() => move(moving)} busy={busy} />
            <Button title="Never mind" kind="secondary" onPress={() => setMoving(null)} />
          </Card>
        ) : (
          <Button title="Reschedule" kind="secondary" icon={<Ionicons name="time-outline" size={18} color={t.text} />} onPress={() => setMoving(start)} />
        )
      )}
      <Button title="Email guest" kind="secondary" icon={<Ionicons name="mail-outline" size={18} color={t.text} />} onPress={() => Linking.openURL(`mailto:${booking.visitor_email}`)} />
      {upcoming && <Button title="Cancel booking" kind="danger" onPress={cancel} busy={busy && !moving} />}
    </ScrollView>
  );
}

function Detail({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: onPress ? t.primary : t.text, fontSize: 16, marginTop: 2 }} onPress={onPress} selectable>
        {value}
      </Text>
    </View>
  );
}

function statusLabel(s: string) {
  return s === "pending_payment" ? "Waiting for payment" : s === "cancelled" ? "Cancelled" : s === "rescheduled" ? "Moved" : s;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  type: { fontSize: 14, fontWeight: "600", flex: 1 },
  status: { fontSize: 12, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  name: { fontSize: 26, fontWeight: "800", marginTop: 8 },
  when: { fontSize: 17, fontWeight: "600", marginTop: 6 },
  time: { fontSize: 15, marginTop: 2 },
  link: { fontSize: 15, marginTop: 10 },
});
