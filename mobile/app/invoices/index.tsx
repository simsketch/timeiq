import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import {
  type Client,
  type Invoice,
  type InvoicePreview,
  type InvoiceStatus,
  type InvoiceSummary,
  STATUS_COLOR,
  STATUS_LABEL,
  dateToDay,
  dayToDate,
  errorText,
  fmtDay,
  fmtHours,
  fmtMoney,
  isOverdue,
  monthRange,
  todayIn,
} from "@/lib/invoicing";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const PRESETS = [
  { label: "This month", monthsAgo: 0 },
  { label: "Last month", monthsAgo: 1 },
];

type Draft = { client_id: string; period_start: string; period_end: string };

export default function Invoices() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(zone);
  const off = me?.invoicing_enabled === false;
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ key: string; data: InvoicePreview | null } | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([api<InvoiceSummary[]>("/api/invoices"), api<Client[]>("/api/clients")]);
      setInvoices(i);
      setClients(c);
      setError(null);
    } catch (e) {
      setError(errorText(e, "Couldn't load your invoices."));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      if (!off) load();
    }, [load, off])
  );

  const previewKey = draft && draft.client_id && draft.period_end >= draft.period_start ? `${draft.client_id}|${draft.period_start}|${draft.period_end}` : null;
  const shown = previewKey && preview?.key === previewKey ? preview.data : null;

  useEffect(() => {
    if (!previewKey || !draft) return;
    let cancelled = false;
    api<InvoicePreview>(`/api/invoices/preview?client_id=${draft.client_id}&period_start=${draft.period_start}&period_end=${draft.period_end}`)
      .then((data) => !cancelled && setPreview({ key: previewKey, data }))
      .catch(() => !cancelled && setPreview({ key: previewKey, data: null }));
    return () => {
      cancelled = true;
    };
    // previewKey carries every field of the draft the request uses.
  }, [api, previewKey]);

  function start() {
    if (!clients.length) {
      return Alert.alert("Add a client first", "Invoices bill a client's unbilled time.", [
        { text: "Cancel", style: "cancel" },
        { text: "Add a client", onPress: () => router.push("/clients") },
      ]);
    }
    setDraft({ client_id: clients[0].id, ...monthRange(today, 1) });
  }

  async function create() {
    if (!draft) return;
    setCreating(true);
    try {
      const inv = await api<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(draft) });
      setDraft(null);
      router.push({ pathname: "/invoices/[id]", params: { id: inv.id } });
    } catch (e) {
      Alert.alert("Invoice not created", errorText(e));
    } finally {
      setCreating(false);
    }
  }

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          draft || off || !invoices ? null : (
            <Pressable onPress={start} hitSlop={10} accessibilityLabel="New invoice">
              <Ionicons name="add-circle" size={28} color={t.primary} />
            </Pressable>
          ),
      }}
    />
  );

  if (off) {
    return (
      <View style={styles.page}>
        {header}
        <Notice>Time tracking and invoicing aren't turned on for this account.</Notice>
      </View>
    );
  }

  if (draft) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        {header}
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>Pulls every unbilled entry for the client in this period.</Text>
        <Label>Client</Label>
        <View style={styles.chips}>
          {clients.map((c) => {
            const on = c.id === draft.client_id;
            return (
              <Pressable key={c.id} onPress={() => setDraft({ ...draft, client_id: c.id })} style={[styles.chip, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.card }]}>
                <Text style={{ color: on ? t.primaryText : t.text, fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Label>Period</Label>
        <View style={[styles.segment, { borderColor: t.border, backgroundColor: t.card }]}>
          {PRESETS.map(({ label, monthsAgo }) => {
            const range = monthRange(today, monthsAgo);
            const on = draft.period_start === range.period_start && draft.period_end === range.period_end;
            return (
              <Pressable
                key={label}
                onPress={() => setDraft({ ...draft, ...range })}
                accessibilityState={{ selected: on }}
                style={[styles.segmentItem, { backgroundColor: on ? t.text : "transparent" }]}
              >
                <Text style={{ color: on ? t.bg : t.muted, fontWeight: "600" }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.dates}>
          <View style={{ flex: 1 }}>
            <Label>From</Label>
            <DayField value={draft.period_start} onChange={(period_start) => setDraft({ ...draft, period_start })} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>To</Label>
            <DayField value={draft.period_end} onChange={(period_end) => setDraft({ ...draft, period_end })} />
          </View>
        </View>
        <Card>
          {draft.period_end < draft.period_start ? (
            <Text style={{ color: t.danger, fontSize: 15 }}>The period ends before it starts.</Text>
          ) : shown ? (
            shown.entry_count === 0 ? (
              <Text style={{ color: t.muted, fontSize: 15 }}>No unbilled entries in this period.</Text>
            ) : (
              <View style={{ gap: 4 }}>
                <Text style={{ color: t.muted, fontSize: 15 }}>
                  {shown.entry_count} entr{shown.entry_count === 1 ? "y" : "ies"} · {fmtHours(shown.total_hours)}
                </Text>
                <Text style={{ color: t.text, fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{fmtMoney(shown.subtotal, shown.currency)}</Text>
              </View>
            )
          ) : (
            <ActivityIndicator />
          )}
        </Card>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setDraft(null)} /></View>
          <View style={{ flex: 1 }}>
            <Button title="Create draft" busy={creating} disabled={!shown || shown.entry_count === 0} onPress={create} />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {header}
      {error && <Notice tone="error">{error}</Notice>}
      {!invoices && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
      {invoices?.length === 0 && <Notice>No invoices yet. Bill a client's unbilled time for a period.</Notice>}
      {invoices?.map((inv) => (
        <Pressable key={inv.id} onPress={() => router.push({ pathname: "/invoices/[id]", params: { id: inv.id } })} accessibilityRole="button">
          {({ pressed }) => (
            <Card style={{ gap: 6, opacity: pressed ? 0.7 : 1 }}>
              <View style={styles.line}>
                <Text style={[styles.number, { color: t.text }]}>{inv.number}</Text>
                <StatusBadge status={inv.status} overdue={isOverdue(inv, today)} />
                <Text style={[styles.amount, { color: t.text }]}>{fmtMoney(inv.subtotal, inv.currency)}</Text>
              </View>
              <Text style={{ color: t.text, fontSize: 16 }} numberOfLines={1}>{inv.client_name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {fmtDay(inv.period_start)} – {fmtDay(inv.period_end)}
              </Text>
            </Card>
          )}
        </Pressable>
      ))}
      {invoices && <Button title="New invoice" icon={<Ionicons name="add" size={20} color={t.primaryText} />} onPress={start} />}
    </ScrollView>
  );
}

function StatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  const t = useTheme();
  const color = overdue ? t.danger : STATUS_COLOR[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{overdue ? "Overdue" : STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** A calendar-day picker for yyyy-MM-dd values. */
function DayField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (Platform.OS === "ios") {
    return (
      <View style={{ alignItems: "flex-start" }}>
        <DateTimePicker value={dayToDate(value)} mode="date" onChange={(_, d) => d && onChange(dateToDay(d))} accentColor={t.primary} />
      </View>
    );
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, { borderColor: t.border, backgroundColor: t.card }]}>
        <Text style={{ color: t.text, fontSize: 16 }}>{fmtDay(value)}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={dayToDate(value)}
          mode="date"
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === "set" && d) onChange(dateToDay(d));
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, maxWidth: "100%" },
  segment: { flexDirection: "row", alignSelf: "flex-start", borderWidth: 1, borderRadius: 11, padding: 3 },
  segmentItem: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  dates: { flexDirection: "row", gap: 12 },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  number: { fontSize: 16, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  amount: { flex: 1, textAlign: "right", fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"] },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
});
