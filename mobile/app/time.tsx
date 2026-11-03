import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import {
  type Client,
  type MoneyStats,
  type SuggestedEntry,
  type TimeEntry,
  type TimesheetRow,
  type UnbilledSummary,
  addDays,
  dateToDay,
  dayToDate,
  errorText,
  fmtDay,
  fmtHm,
  fmtHours,
  fmtMoney,
  parseHours,
  todayIn,
  weekStartOf,
  weekdayOf,
} from "@/lib/invoicing";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const rowKey = (clientId: string, description: string) => `${clientId}::${description.trim().toLowerCase()}`;

interface Row {
  key: string;
  client_id: string;
  client_name: string;
  description: string;
  saved_id?: string; // present when the row is saved server-side and repeats every week
}

// A billed entry needs ?force=true, which also rewrites its invoice line.
const entryUrl = (e: TimeEntry) => `/api/time-entries/${e.id}${e.invoice_id ? "?force=true" : ""}`;
// Hours on a draft stay editable; only invoices that went out lock them.
const isLocked = (e: TimeEntry) => !!e.invoice_id && e.invoice_status !== "draft";
const invoiceList = (entries: TimeEntry[]) => Array.from(new Set(entries.map((e) => e.invoice_number).filter(Boolean))).join(", ");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Form = { kind: "add" | "edit"; row?: Row; client_id: string; description: string } | { kind: "import" };
type Pending =
  | { kind: "edit"; row: Row; clientId: string; description: string; thisWeek: TimeEntry[]; allWeeks: TimeEntry[]; merges: boolean }
  | { kind: "delete"; row: Row; billed: TimeEntry[]; all: TimeEntry[] };

export default function Timesheet() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(zone);
  const off = me?.invoicing_enabled === false;

  const [weekPick, setWeekPick] = useState<string | null>(null);
  const weekStart = weekPick ?? weekStartOf(today);
  const weekEnd = addDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [dayPick, setDayPick] = useState<string | null>(null);
  const day = dayPick && dayPick >= weekStart && dayPick <= weekEnd ? dayPick : today >= weekStart && today <= weekEnd ? today : weekStart;

  const [clients, setClients] = useState<Client[] | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<UnbilledSummary[]>([]);
  const [savedRows, setSavedRows] = useState<TimesheetRow[]>([]);
  const [target, setTarget] = useState(40);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  // Billed cells the user chose to edit anyway this session.
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Form | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, e, s, r, m] = await Promise.all([
        api<Client[]>("/api/clients"),
        api<TimeEntry[]>(`/api/time-entries?start=${weekStart}&end=${weekEnd}`),
        api<UnbilledSummary[]>("/api/time-entries/summary"),
        api<TimesheetRow[]>("/api/timesheet-rows"),
        api<MoneyStats>("/api/dashboard/money").catch(() => null),
      ]);
      setClients(c);
      setEntries(e);
      setSummary(s);
      setSavedRows(r);
      if (m) setTarget(m.weekly_hours_target);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Couldn't load your timesheet."));
    }
  }, [api, weekStart, weekEnd]);

  useFocusEffect(
    useCallback(() => {
      if (!off) load();
    }, [load, off])
  );

  // Saved rows first, then any client + task that has entries this week.
  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const r of savedRows) {
      const key = rowKey(r.client_id, r.description);
      map.set(key, { key, client_id: r.client_id, client_name: r.client_name, description: r.description, saved_id: r.id });
    }
    for (const e of entries) {
      const key = rowKey(e.client_id, e.description);
      if (!map.has(key)) map.set(key, { key, client_id: e.client_id, client_name: e.client_name, description: e.description });
    }
    return [...map.values()].sort((a, b) => a.client_name.localeCompare(b.client_name) || a.description.localeCompare(b.description));
  }, [entries, savedRows]);

  const cells = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    for (const e of entries) (m[`${rowKey(e.client_id, e.description)}|${e.entry_date}`] ??= []).push(e);
    return m;
  }, [entries]);
  const cellOf = (row: Row, d: string) => cells[`${row.key}|${d}`] ?? [];
  const sum = (list: TimeEntry[]) => list.reduce((s, e) => s + parseFloat(e.hours), 0);
  const dayTotals = days.map((d) => sum(entries.filter((e) => e.entry_date === d)));
  const weekTotal = dayTotals.reduce((s, h) => s + h, 0);

  async function commitCell(row: Row, d: string, raw: string) {
    const hours = parseHours(raw);
    if (hours === null) return Alert.alert("Hours not saved", "Enter hours like 2, 2.5, 1:30 or 2h 30m.");
    const existing = cellOf(row, d);
    if (Math.abs(hours - sum(existing)) < 0.001) return;
    const cellKey = `${row.key}|${d}`;
    if (existing.some(isLocked) && !unlocked.has(cellKey)) return;
    if (hours > 24) return Alert.alert("Hours not saved", "A day holds 24 hours or less.");
    setSaving((s) => new Set(s).add(cellKey));
    try {
      if (hours === 0) {
        await Promise.all(existing.map((e) => api(entryUrl(e), { method: "DELETE" })));
      } else if (existing.length > 0) {
        // Fold the whole cell into the first entry.
        await api(entryUrl(existing[0]), { method: "PATCH", body: JSON.stringify({ hours: hours.toFixed(2) }) });
        await Promise.all(existing.slice(1).map((e) => api(entryUrl(e), { method: "DELETE" })));
      } else {
        await api("/api/time-entries", {
          method: "POST",
          body: JSON.stringify({ client_id: row.client_id, entry_date: d, hours: hours.toFixed(2), description: row.description }),
        });
      }
      await load();
    } catch (e) {
      Alert.alert("Not saved", errorText(e));
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(cellKey);
        return n;
      });
    }
  }

  function unlock(row: Row, d: string) {
    const billed = cellOf(row, d).find(isLocked);
    if (!billed) return;
    Alert.alert(
      "Edit billed time?",
      `These hours are billed on ${billed.invoice_number}. Editing them rewrites that invoice line and retotals the invoice. A copy your client already received won't change.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Edit anyway", onPress: () => setUnlocked((u) => new Set(u).add(`${row.key}|${d}`)) },
      ]
    );
  }

  async function addRow(clientId: string, raw: string) {
    const description = raw.trim();
    if (!clientId || !description) return Alert.alert("Pick a client and name the task", "For example: Platform support.");
    setBusy(true);
    try {
      const created = await api<TimesheetRow>("/api/timesheet-rows", { method: "POST", body: JSON.stringify({ client_id: clientId, description }) });
      setSavedRows((prev) => (prev.some((r) => r.id === created.id) ? prev : [...prev, created]));
      setForm(null);
    } catch (e) {
      Alert.alert("Row not added", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveRowEdit(row: Row, clientId: string, raw: string) {
    const description = raw.trim();
    if (!clientId || !description) return Alert.alert("Pick a client and name the task");
    if (clientId === row.client_id && description === row.description) return setForm(null);
    const newKey = rowKey(clientId, description);
    let merges = rows.some((r) => r.key === newKey && r.key !== row.key);
    const thisWeek = entries.filter((e) => rowKey(e.client_id, e.description) === row.key);
    // A task usually spans more than this week, so look at all of it first.
    let allWeeks = thisWeek;
    setBusy(true);
    try {
      const every = await api<TimeEntry[]>(`/api/time-entries?client_id=${row.client_id}`);
      allWeeks = every.filter((e) => rowKey(e.client_id, e.description) === row.key);
      merges = merges || every.some((e) => rowKey(e.client_id, e.description) === newKey);
    } catch {
      // Fall back to the week on screen rather than blocking the rename.
    } finally {
      setBusy(false);
    }
    if (allWeeks.filter(isLocked).length === 0 && allWeeks.length === thisWeek.length && !merges) {
      return applyRowEdit(row, clientId, description, thisWeek);
    }
    setPending({ kind: "edit", row, clientId, description, thisWeek, allWeeks, merges });
  }

  async function applyRowEdit(row: Row, clientId: string, description: string, targets: TimeEntry[]) {
    if (targets.length === 0 && !row.saved_id) return Alert.alert("Nothing to rename", "Every entry in this row is already on an invoice.");
    setBusy(true);
    try {
      await Promise.all(targets.map((e) => api(entryUrl(e), { method: "PATCH", body: JSON.stringify({ client_id: clientId, description }) })));
      if (row.saved_id) {
        const updated = await api<TimesheetRow>(`/api/timesheet-rows/${row.saved_id}`, { method: "PATCH", body: JSON.stringify({ client_id: clientId, description }) });
        setSavedRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      const touched = targets.filter(isLocked);
      if (touched.length > 0) {
        Alert.alert(
          `Updated ${plural(targets.length, "entry", "entries")}`,
          `${touched.length} on ${invoiceList(touched)} ${touched.length === 1 ? "was" : "were"} rewritten and the invoice retotalled.`
        );
      }
      setPending(null);
      setForm(null);
      await load();
    } catch (e) {
      Alert.alert("Not updated", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function deleteRow(row: Row) {
    const rowEntries = entries.filter((e) => rowKey(e.client_id, e.description) === row.key);
    const unbilled = rowEntries.filter((e) => !isLocked(e));
    const billed = rowEntries.filter(isLocked);
    if (billed.length > 0) return setPending({ kind: "delete", row, billed, all: rowEntries });
    const msg = unbilled.length
      ? `This removes the row and its ${plural(unbilled.length, "unbilled entry", "unbilled entries")} this week. It stops appearing in future weeks.`
      : row.saved_id
        ? "It stops appearing in future weeks."
        : null;
    if (!msg) return applyRowDelete(row, unbilled);
    Alert.alert(`Remove "${row.description}"?`, msg, [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => applyRowDelete(row, unbilled) },
    ]);
  }

  async function applyRowDelete(row: Row, targets: TimeEntry[]) {
    if (targets.length === 0 && !row.saved_id) return Alert.alert("Nothing to delete", "Every entry in this row is already on an invoice.");
    setBusy(true);
    try {
      await Promise.all(targets.map((e) => api(entryUrl(e), { method: "DELETE" })));
      if (row.saved_id) {
        await api(`/api/timesheet-rows/${row.saved_id}`, { method: "DELETE" });
        setSavedRows((prev) => prev.filter((r) => r.id !== row.saved_id));
      }
      setPending(null);
      setForm(null);
      await load();
    } catch (e) {
      Alert.alert("Not deleted", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyPreviousWeek() {
    setBusy(true);
    try {
      const prev = await api<TimeEntry[]>(`/api/time-entries?start=${addDays(weekStart, -7)}&end=${addDays(weekEnd, -7)}`);
      const seen = new Set(rows.map((r) => r.key));
      const added: TimesheetRow[] = [];
      for (const e of prev) {
        const key = rowKey(e.client_id, e.description);
        if (seen.has(key)) continue;
        seen.add(key);
        added.push(await api<TimesheetRow>("/api/timesheet-rows", { method: "POST", body: JSON.stringify({ client_id: e.client_id, description: e.description }) }));
      }
      setSavedRows((p) => [...p, ...added.filter((a) => !p.some((r) => r.id === a.id))]);
      Alert.alert(added.length ? `Copied ${plural(added.length, "row", "rows")} from last week` : "Nothing new to copy from last week");
    } catch (e) {
      Alert.alert("Not copied", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function more() {
    if (!clients?.length) return;
    Alert.alert("Timesheet", undefined, [
      { text: "Copy previous week's rows", onPress: copyPreviousWeek },
      { text: "Import from calendar", onPress: () => setForm({ kind: "import" }) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          form || pending || !clients?.length ? null : (
            <Pressable onPress={more} hitSlop={10} accessibilityLabel="More timesheet actions" disabled={busy}>
              <Ionicons name="ellipsis-horizontal-circle" size={26} color={t.primary} />
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

  if (pending) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        {header}
        <PendingCard pending={pending} busy={busy} onCancel={() => setPending(null)} onEdit={applyRowEdit} onDelete={applyRowDelete} />
      </ScrollView>
    );
  }

  if (form?.kind === "import" && clients) {
    return (
      <>
        {header}
        <ImportForm clients={clients} start={weekStart} end={weekEnd} onClose={() => setForm(null)} onImported={() => { setForm(null); load(); }} />
      </>
    );
  }

  if (form && form.kind !== "import" && clients) {
    const taken = new Set(rows.filter((r) => r.client_id === form.client_id && r.key !== form.row?.key).map((r) => r.description.trim().toLowerCase()));
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {header}
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          {form.kind === "add" ? "A row is a client plus a task. It stays on your timesheet every week." : "Renaming changes this task's entries too."}
        </Text>
        <Label>Client</Label>
        <ClientChips clients={clients} value={form.client_id} onChange={(client_id) => setForm({ ...form, client_id })} />
        <Label>Task</Label>
        <TextInput
          value={form.description}
          onChangeText={(description) => setForm({ ...form, description })}
          placeholder="Platform support"
          placeholderTextColor={t.muted}
          autoFocus={form.kind === "add"}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        <TaskSuggestions clientId={form.client_id} value={form.description} taken={taken} onPick={(description) => setForm({ ...form, description })} />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setForm(null)} /></View>
          <View style={{ flex: 1 }}>
            <Button
              title={form.kind === "add" ? "Add row" : "Save"}
              busy={busy}
              onPress={() => (form.kind === "add" ? addRow(form.client_id, form.description) : saveRowEdit(form.row!, form.client_id, form.description))}
            />
          </View>
        </View>
        {form.kind === "edit" && <Button title="Remove row" kind="danger" disabled={busy} onPress={() => deleteRow(form.row!)} />}
      </ScrollView>
    );
  }

  const isThisWeek = weekStart === weekStartOf(today);
  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7);
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {header}
      {error && <Notice tone="error">{error}</Notice>}
      {!clients && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
      {clients?.length === 0 && (
        <>
          <Notice>Add a client first, then log time against it.</Notice>
          <Button title="Add a client" onPress={() => router.push("/clients")} />
        </>
      )}

      {!!clients?.length && (
        <>
          {summary.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {summary.map((s) => (
                <View key={s.client_id} style={[styles.pill, { borderColor: t.border, backgroundColor: t.card }]}>
                  <Text style={{ color: t.text, fontSize: 13 }}>
                    <Text style={{ fontWeight: "600" }}>{s.client_name}</Text> unbilled {fmtHours(s.unbilled_hours)} · {fmtMoney(s.unbilled_amount, s.currency)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Card style={{ gap: 12 }}>
            <View style={styles.weekNav}>
              <Pressable onPress={() => setWeekPick(addDays(weekStart, -7))} hitSlop={10} accessibilityLabel="Previous week">
                <Ionicons name="chevron-back" size={24} color={t.primary} />
              </Pressable>
              <Pressable style={{ flex: 1, alignItems: "center" }} onPress={() => setWeekPick(null)} disabled={isThisWeek}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>
                  {fmtDay(weekStart, { month: "short", day: "numeric" })} – {fmtDay(weekEnd, sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}
                </Text>
                {!isThisWeek && <Text style={{ color: t.primary, fontSize: 13, marginTop: 2 }}>Back to this week</Text>}
              </Pressable>
              <Pressable onPress={() => setWeekPick(addDays(weekStart, 7))} hitSlop={10} accessibilityLabel="Next week">
                <Ionicons name="chevron-forward" size={24} color={t.primary} />
              </Pressable>
            </View>
            <View>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>
                Week total {fmtHm(weekTotal) || "0h"}
                {target > 0 && <Text style={{ color: t.muted, fontWeight: "400" }}> / {target}h</Text>}
              </Text>
              {target > 0 && (
                <View style={[styles.bar, { backgroundColor: t.border }]}>
                  <View style={[styles.barFill, { backgroundColor: t.primary, width: `${Math.min(100, (weekTotal / target) * 100)}%` }]} />
                </View>
              )}
            </View>
            <View style={styles.days}>
              {days.map((d, i) => {
                const on = d === day;
                const weekend = weekdayOf(d) === 0 || weekdayOf(d) === 6;
                const fg = on ? t.primaryText : d === today ? t.primary : weekend ? t.muted : t.text;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDayPick(d)}
                    accessibilityLabel={`${fmtDay(d, { weekday: "long", month: "long", day: "numeric" })}, ${fmtHm(dayTotals[i]) || "no hours"}`}
                    style={[styles.day, { backgroundColor: on ? t.primary : "transparent", borderColor: on ? t.primary : t.border }]}
                  >
                    <Text style={{ color: fg, fontSize: 11, fontWeight: "600" }}>{fmtDay(d, { weekday: "narrow" })}</Text>
                    <Text style={{ color: fg, fontSize: 17, fontWeight: "700" }}>{fmtDay(d, { day: "numeric" })}</Text>
                    <Text style={{ color: on ? t.primaryText : t.muted, fontSize: 11 }} numberOfLines={1}>{fmtHm(dayTotals[i]) || " "}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Label>{fmtDay(day, { weekday: "long", month: "long", day: "numeric" })}</Label>
          {rows.length === 0 && <Notice>No rows yet. Add a row once and it stays on your timesheet every week.</Notice>}
          {rows.map((row) => {
            const cell = cellOf(row, day);
            const billed = cell.find(isLocked) ?? null;
            const weekHours = sum(entries.filter((e) => rowKey(e.client_id, e.description) === row.key));
            const cellKey = `${row.key}|${day}`;
            return (
              <Card key={row.key} style={styles.rowCard}>
                <Pressable style={{ flex: 1 }} onPress={() => setForm({ kind: "edit", row, client_id: row.client_id, description: row.description })}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>{row.client_name}</Text>
                  <Text style={{ color: t.muted, fontSize: 14, marginTop: 2 }} numberOfLines={2}>{row.description}</Text>
                  {weekHours > 0 && <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>{fmtHm(weekHours)} this week</Text>}
                </Pressable>
                {billed && !unlocked.has(cellKey) ? (
                  <Pressable
                    onPress={() => unlock(row, day)}
                    accessibilityLabel={`${fmtHm(sum(cell))}, billed on ${billed.invoice_number}. Edit anyway`}
                    style={[styles.cell, styles.locked, { borderColor: t.border, backgroundColor: t.bg }]}
                  >
                    <Ionicons name="lock-closed" size={12} color={t.muted} />
                    <Text style={{ color: t.muted, fontSize: 16, fontVariant: ["tabular-nums"] }}>{fmtHm(sum(cell))}</Text>
                  </Pressable>
                ) : (
                  <HourCell
                    key={cellKey}
                    value={sum(cell)}
                    saving={saving.has(cellKey)}
                    label={`Hours for ${row.client_name}, ${row.description}`}
                    onCommit={(raw) => commitCell(row, day, raw)}
                  />
                )}
              </Card>
            );
          })}
          <Button
            title="Add row"
            kind="secondary"
            icon={<Ionicons name="add" size={20} color={t.text} />}
            onPress={() => setForm({ kind: "add", client_id: clients[0].id, description: "" })}
          />
          <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
            Type hours like 2, 2.5 or 1:30. They save when you leave the field. Locked hours are on a sent invoice.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function HourCell({ value, saving, label, onCommit }: { value: number; saving: boolean; label: string; onCommit: (raw: string) => void }) {
  const t = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  // Single-line inputs blur on submit, which commits through onBlur.
  return (
    <TextInput
      accessibilityLabel={label}
      value={draft ?? fmtHm(value)}
      placeholder="0h"
      placeholderTextColor={t.muted}
      keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
      returnKeyType="done"
      selectTextOnFocus
      onFocus={() => setDraft(value ? String(Math.round(value * 100) / 100) : "")}
      onChangeText={setDraft}
      onBlur={() => {
        if (draft !== null) onCommit(draft);
        setDraft(null);
      }}
      style={[styles.cell, { color: t.text, borderColor: t.border, backgroundColor: t.card, opacity: saving ? 0.5 : 1 }]}
    />
  );
}

function PendingCard({
  pending,
  busy,
  onCancel,
  onEdit,
  onDelete,
}: {
  pending: Pending;
  busy: boolean;
  onCancel: () => void;
  onEdit: (row: Row, clientId: string, description: string, targets: TimeEntry[]) => void;
  onDelete: (row: Row, targets: TimeEntry[]) => void;
}) {
  const t = useTheme();
  if (pending.kind === "delete") {
    const unbilled = pending.all.filter((e) => !isLocked(e));
    return (
      <Card style={{ gap: 12 }}>
        <Text style={[styles.pendingTitle, { color: t.text }]}>Delete billed time?</Text>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          {pending.billed.length} of {pending.all.length} entries in this row are billed on {invoiceList(pending.billed)}. Deleting them removes those invoice lines and retotals{" "}
          {pending.billed.length === 1 ? "the invoice" : "the invoices"}. Invoices you already sent will no longer match the copy your client received.
        </Text>
        <Button title="Delete all" kind="danger" busy={busy} onPress={() => onDelete(pending.row, pending.all)} />
        {unbilled.length > 0 && <Button title="Unbilled only" kind="secondary" disabled={busy} onPress={() => onDelete(pending.row, unbilled)} />}
        <Button title="Cancel" kind="secondary" disabled={busy} onPress={onCancel} />
      </Card>
    );
  }
  const { row, clientId, description, thisWeek, allWeeks, merges } = pending;
  const billed = allWeeks.filter(isLocked);
  const unbilled = allWeeks.filter((e) => !isLocked(e));
  const elsewhere = allWeeks.length - thisWeek.length;
  return (
    <Card style={{ gap: 12 }}>
      <Text style={[styles.pendingTitle, { color: t.text }]}>Rename "{row.description}"?</Text>
      <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
        This task has {plural(thisWeek.length, "entry", "entries")} in the week on screen{elsewhere > 0 ? ` and ${elsewhere} in other weeks` : ""}.
        {billed.length > 0 && ` ${billed.length} of them are billed on ${invoiceList(allWeeks)}; renaming those rewrites the invoice lines and retotals the invoice. Invoices you already sent will no longer match the copy your client received.`}
        {merges && " This name is already in use, so the two rows will merge."}
      </Text>
      <Button title={elsewhere > 0 ? "Rename all weeks" : "Rename all"} busy={busy} onPress={() => onEdit(row, clientId, description, allWeeks)} />
      {unbilled.length > 0 && billed.length > 0 && <Button title="Unbilled only" kind="secondary" disabled={busy} onPress={() => onEdit(row, clientId, description, unbilled)} />}
      {thisWeek.length > 0 && elsewhere > 0 && <Button title="This week only" kind="secondary" disabled={busy} onPress={() => onEdit(row, clientId, description, thisWeek)} />}
      <Button title="Cancel" kind="secondary" disabled={busy} onPress={onCancel} />
    </Card>
  );
}

/** Tasks already used for the client, filtered as you type. */
function TaskSuggestions({ clientId, value, taken, onPick }: { clientId: string; value: string; taken: Set<string>; onPick: (name: string) => void }) {
  const t = useTheme();
  const api = useApi();
  const [tasks, setTasks] = useState<{ for: string; names: string[] }>({ for: "", names: [] });
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    api<string[]>(`/api/time-entries/tasks?client_id=${clientId}`)
      .then((names) => !cancelled && setTasks({ for: clientId, names }))
      .catch(() => undefined); // Suggestions are a convenience; typing still works.
    return () => {
      cancelled = true;
    };
  }, [api, clientId]);
  const q = value.trim().toLowerCase();
  const names = (tasks.for === clientId ? tasks.names : [])
    .filter((n) => !q || n.toLowerCase().includes(q))
    .filter((n) => n.trim().toLowerCase() !== q)
    .sort((a, b) => Number(taken.has(a.trim().toLowerCase())) - Number(taken.has(b.trim().toLowerCase())))
    .slice(0, 12);
  if (!names.length) return null;
  return (
    <View style={styles.chips}>
      {names.map((n) => (
        <Pressable key={n} onPress={() => onPick(n)} style={[styles.chip, { borderColor: t.border, backgroundColor: t.card }]}>
          <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={1}>{n}</Text>
          {taken.has(n.trim().toLowerCase()) && <Text style={{ color: t.muted, fontSize: 12 }}>on sheet</Text>}
        </Pressable>
      ))}
    </View>
  );
}

type Found = SuggestedEntry & { checked: boolean; description: string };

/** Find synced calendar events whose title matches the client's keywords, and log them. */
function ImportForm({ clients, start: start0, end: end0, onClose, onImported }: { clients: Client[]; start: string; end: string; onClose: () => void; onImported: () => void }) {
  const t = useTheme();
  const api = useApi();
  const [clientId, setClientId] = useState(clients[0].id);
  const [start, setStart] = useState(start0);
  const [end, setEnd] = useState(end0);
  const [found, setFound] = useState<{ key: string; rows: Found[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const key = `${clientId}|${start}|${end}`;
  // Results only count while the form still matches what was searched.
  const rows = found?.key === key ? found.rows : null;
  const client = clients.find((c) => c.id === clientId);

  async function search() {
    const mine = ++seq.current;
    setSearching(true);
    try {
      const list = await api<SuggestedEntry[]>("/api/time-entries/suggest", { method: "POST", body: JSON.stringify({ client_id: clientId, start, end }) });
      if (mine === seq.current) setFound({ key, rows: list.map((s) => ({ ...s, checked: true, description: s.title })) });
    } catch (e) {
      if (mine === seq.current) Alert.alert("Search failed", errorText(e));
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }

  async function importChecked() {
    const picked = (rows ?? []).filter((r) => r.checked);
    if (!picked.length) return;
    if (picked.some((r) => !(parseFloat(r.hours) > 0) || !r.description.trim())) return Alert.alert("Check the rows", "Each row needs a description and hours above 0.");
    setBusy(true);
    try {
      await api("/api/time-entries/bulk", {
        method: "POST",
        body: JSON.stringify({ entries: picked.map((r) => ({ client_id: clientId, entry_date: r.entry_date, hours: r.hours, description: r.description.trim() })) }),
      });
      Alert.alert(`Imported ${plural(picked.length, "entry", "entries")}`);
      onImported();
    } catch (e) {
      Alert.alert("Import failed", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number, patch: Partial<Found>) => setFound((f) => f && { ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>Finds synced calendar events whose title matches the client's keywords.</Text>
      <Label>Client</Label>
      <ClientChips clients={clients} value={clientId} onChange={setClientId} />
      {client && !client.match_keywords && <Notice tone="warn">This client has no calendar keywords. Add some on the Clients screen first.</Notice>}
      <View style={styles.dates}>
        <View style={{ flex: 1 }}><Label>From</Label><DayField value={start} onChange={setStart} /></View>
        <View style={{ flex: 1 }}><Label>To</Label><DayField value={end} onChange={setEnd} /></View>
      </View>
      <Button title="Search" kind="secondary" busy={searching} disabled={busy || end < start} onPress={search} />
      {rows?.length === 0 && <Notice>No matching events that aren't already logged.</Notice>}
      {rows?.map((r, i) => (
        <Card key={`${r.external_id}-${r.starts_at}`} style={{ gap: 8, opacity: r.checked ? 1 : 0.6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: t.text, fontWeight: "600", flex: 1 }}>{fmtDay(r.entry_date, { weekday: "short", month: "short", day: "numeric" })}</Text>
            <Switch value={r.checked} onValueChange={(checked) => update(i, { checked })} trackColor={{ true: t.primary }} accessibilityLabel={`Import ${r.description}`} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput value={r.description} onChangeText={(description) => update(i, { description })} style={[styles.input, { flex: 1, color: t.text, borderColor: t.border, backgroundColor: t.card }]} />
            <TextInput
              value={r.hours}
              onChangeText={(hours) => update(i, { hours })}
              keyboardType="decimal-pad"
              accessibilityLabel="Hours"
              style={[styles.input, { width: 80, textAlign: "center", color: t.text, borderColor: t.border, backgroundColor: t.card }]}
            />
          </View>
        </Card>
      ))}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={onClose} /></View>
        <View style={{ flex: 1 }}>
          <Button title="Import selected" busy={busy} disabled={searching || !rows || rows.every((r) => !r.checked)} onPress={importChecked} />
        </View>
      </View>
    </ScrollView>
  );
}

function ClientChips({ clients, value, onChange }: { clients: Client[]; value: string; onChange: (id: string) => void }) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {clients.map((c) => {
        const on = c.id === value;
        return (
          <Pressable key={c.id} onPress={() => onChange(c.id)} style={[styles.chip, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.card }]}>
            <Text style={{ color: on ? t.primaryText : t.text, fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
          </Pressable>
        );
      })}
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
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  weekNav: { flexDirection: "row", alignItems: "center", gap: 8 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", borderRadius: 3 },
  days: { flexDirection: "row", gap: 4 },
  day: { flex: 1, alignItems: "center", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 6, gap: 1 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  cell: { width: 88, minHeight: 44, borderWidth: 1, borderRadius: 10, textAlign: "center", fontSize: 16, fontVariant: ["tabular-nums"], paddingHorizontal: 6 },
  locked: { borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  dates: { flexDirection: "row", gap: 12 },
  pendingTitle: { fontSize: 18, fontWeight: "700" },
});
