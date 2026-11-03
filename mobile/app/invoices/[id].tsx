import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { getPref, setPref } from "@/lib/prefs";
import { useApi } from "@/lib/api";
import { API_URL, SITE_URL } from "@/lib/config";
import {
  type Invoice,
  type InvoicePreview,
  STATUS_COLOR,
  STATUS_LABEL,
  addDays,
  dateToDay,
  dayToDate,
  errorText,
  fmtDay,
  fmtMoney,
  fmtSpan,
  groupTimeLines,
  invoiceTotals,
  isOverdue,
  splitEmails,
  todayIn,
  weeklyBreakdown,
} from "@/lib/invoicing";
import { type Theme, useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
/** 8 -> "8", 7.5 -> "7.5", 0 -> blank, so the grid reads at a glance. */
const dayHours = (h: number) => (h ? String(Math.round(h * 100) / 100) : "");

export default function InvoiceDetail() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const me = useMe();
  const zone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<InvoicePreview | null>(null);
  const [fields, setFields] = useState({ issue_date: "", due_date: "", notes: "" });
  const [expense, setExpense] = useState({ description: "", amount: "" });
  const [sending, setSending] = useState<"send" | "remind" | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [copyMe, setCopyMeState] = useState(true);
  useEffect(() => {
    getPref("invoice.copyMe").then((v) => v !== null && setCopyMeState(v === "1"));
  }, []);
  const setCopyMe = (v: boolean) => {
    setCopyMeState(v);
    setPref("invoice.copyMe", v ? "1" : "0");
  };
  const [copied, setCopied] = useState(false);

  const show = useCallback(
    (inv: Invoice) => {
      setInvoice(inv);
      setFields({ issue_date: inv.issue_date, due_date: inv.due_date, notes: inv.notes ?? "" });
      // A draft can miss hours logged after it was made; surface them.
      if (inv.status === "draft") {
        api<InvoicePreview>(`/api/invoices/preview?client_id=${inv.client_id}&period_start=${inv.period_start}&period_end=${inv.period_end}`)
          .then(setMissing)
          .catch(() => setMissing(null));
      } else {
        setMissing(null);
      }
    },
    [api]
  );

  const load = useCallback(async () => {
    try {
      show(await api<Invoice>(`/api/invoices/${id}`));
      setError(null);
    } catch (e) {
      setError(errorText(e, "Couldn't load this invoice."));
    }
  }, [api, id, show]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /** Run one invoice action, then reload. Resolves true when it worked. */
  async function act(path: string, method: string, body?: unknown, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      await api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      await load();
      if (done) Alert.alert(done);
      return true;
    } catch (e) {
      Alert.alert("That didn't work", errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Invoice" }} />
        {error ? <Notice tone="warn">{error}</Notice> : <ActivityIndicator />}
      </View>
    );
  }

  const inv = invoice;
  const base = `/api/invoices/${inv.id}`;
  const isDraft = inv.status === "draft";
  const isSent = inv.status === "sent";
  const isVoid = inv.status === "void";
  const overdue = isOverdue(inv, todayIn(zone));
  const emails = splitEmails(inv.client_billing_email);
  const publicUrl = `${SITE_URL}/invoice/${inv.public_token}`;
  const { expenses } = invoiceTotals(inv.lines);

  function openSend(kind: "send" | "remind") {
    setChosen(emails);
    setSending(kind);
  }

  async function confirmSend() {
    if (!sending) return;
    const who = chosen.length === 1 ? chosen[0] : `${chosen.length} recipients`;
    const copy = copyMe ? ", with a copy to you" : "";
    const ok = await act(`${base}/${sending}`, "POST", { recipients: chosen, copy_me: copyMe }, sending === "send" ? `Invoice sent to ${who}${copy}` : `Reminder sent to ${who}${copy}`);
    if (ok) setSending(null);
  }

  function markPaid() {
    Alert.alert(`Mark ${inv.number} paid?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark paid", onPress: () => act(`${base}/mark-paid`, "POST", undefined) },
    ]);
  }

  function voidIt() {
    Alert.alert(`Void ${inv.number}?`, "Its entries become unbilled again.", [
      { text: "Keep", style: "cancel" },
      { text: "Void", style: "destructive", onPress: () => act(`${base}/void`, "POST", undefined, "Invoice voided") },
    ]);
  }

  function remove() {
    Alert.alert(`Delete draft ${inv.number}?`, "Its entries become unbilled again.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api(base, { method: "DELETE" });
            router.back();
          } catch (e) {
            Alert.alert("Not deleted", errorText(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function addExpense() {
    const description = expense.description.trim();
    if (!description || !(parseFloat(expense.amount) > 0)) return Alert.alert("Add a description and an amount above 0");
    if (await act(`${base}/lines`, "POST", { description, amount: parseFloat(expense.amount).toFixed(2) })) setExpense({ description: "", amount: "" });
  }

  function saveFields() {
    if (fields.due_date < fields.issue_date) return Alert.alert("Check the dates", "The due date is before the issue date.");
    act(base, "PATCH", { ...fields, notes: fields.notes.trim() || null }, "Saved");
  }

  const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }];

  if (sending) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Stack.Screen options={{ title: inv.number }} />
        <Text style={[styles.h2, { color: t.text }]}>
          {sending === "remind" ? `Send a past-due reminder for ${inv.number}?` : `${isDraft ? "Send" : "Resend"} ${inv.number}?`}
        </Text>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          {sending === "remind"
            ? "The invoice PDF goes out again with a past-due note."
            : "Recipients get the PDF and a link to view it online. Everyone you choose is on one email, so they can reply-all."}
        </Text>
        <Label>Send to</Label>
        <Card style={{ gap: 4, paddingVertical: 8 }}>
          {emails.map((email) => (
            <View key={email} style={styles.switchRow}>
              <Text style={{ color: t.text, fontSize: 16, flex: 1 }} numberOfLines={1}>{email}</Text>
              <Switch
                value={chosen.includes(email)}
                onValueChange={(on) => setChosen((c) => (on ? [...c, email] : c.filter((e) => e !== email)))}
                trackColor={{ true: t.primary }}
              />
            </View>
          ))}
        </Card>
        <Card style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 16 }}>Send me a copy</Text>
            {me?.email && <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>BCC to {me.email}</Text>}
          </View>
          <Switch value={copyMe} onValueChange={setCopyMe} trackColor={{ true: t.primary }} />
        </Card>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" disabled={busy} onPress={() => setSending(null)} /></View>
          <View style={{ flex: 1 }}>
            <Button
              title={`${sending === "remind" ? "Send reminder" : isDraft ? "Send" : "Resend"}${chosen.length > 1 ? ` to ${chosen.length}` : ""}`}
              busy={busy}
              disabled={chosen.length === 0}
              onPress={confirmSend}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  const statusColor = overdue ? t.danger : STATUS_COLOR[inv.status];
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Stack.Screen
        options={{
          title: inv.number,
          headerRight: isVoid
            ? undefined
            : () => (
                <Pressable onPress={() => Share.share({ message: publicUrl, url: publicUrl })} hitSlop={10} accessibilityLabel="Share invoice link">
                  <Ionicons name="share-outline" size={24} color={t.primary} />
                </Pressable>
              ),
        }}
      />
      <Card style={{ gap: 6 }}>
        <View style={styles.line}>
          <Text style={[styles.number, { color: t.text }]}>{inv.number}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor + "22" }]}>
            <Text style={{ color: statusColor, fontSize: 12, fontWeight: "700" }}>{overdue ? "Overdue" : STATUS_LABEL[inv.status]}</Text>
          </View>
        </View>
        <Text style={{ color: t.text, fontSize: 17 }}>{inv.client_name}</Text>
        <Text style={{ color: t.text, fontSize: 28, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{fmtMoney(inv.subtotal, inv.currency)}</Text>
        <Text style={{ color: t.muted, fontSize: 14 }}>
          Due {fmtDay(inv.due_date)}
          {inv.sent_at ? ` · Sent ${new Date(inv.sent_at).toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" })}` : ""}
          {inv.paid_at ? ` · Paid ${new Date(inv.paid_at).toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" })}` : ""}
        </Text>
      </Card>

      {isDraft && missing && missing.entry_count > 0 && (
        <Card style={{ gap: 10, backgroundColor: t.warnBg }}>
          <Text style={{ color: t.warnText, fontSize: 15, lineHeight: 21 }}>
            {missing.entry_count} unbilled {missing.entry_count === 1 ? "entry" : "entries"} ({parseFloat(missing.total_hours)}h) in this invoice's period{" "}
            {missing.entry_count === 1 ? "isn't" : "aren't"} on it yet.
          </Text>
          <Button title="Add to invoice" busy={busy} onPress={() => act(`${base}/refresh`, "POST", undefined, "Hours added to invoice")} />
        </Card>
      )}
      {isDraft && emails.length === 0 && (
        <Notice tone="warn">This invoice has no billing email, so it can't be sent. Add one to the client and it will appear here.</Notice>
      )}

      {(isDraft || isSent) && (
        <Button
          title={isDraft ? "Send" : "Resend"}
          icon={<Ionicons name="send" size={17} color={t.primaryText} />}
          disabled={busy || emails.length === 0}
          onPress={() => openSend("send")}
        />
      )}
      {isSent && <Button title="Mark paid" kind="secondary" icon={<Ionicons name="checkmark-circle-outline" size={19} color={t.text} />} disabled={busy} onPress={markPaid} />}
      {overdue && (
        <Button title="Send reminder" kind="secondary" icon={<Ionicons name="notifications-outline" size={18} color={t.text} />} disabled={busy || emails.length === 0} onPress={() => openSend("remind")} />
      )}
      {(isSent || inv.status === "paid") && (
        <Button
          title="Email me a copy"
          kind="secondary"
          icon={<Ionicons name="mail-outline" size={18} color={t.text} />}
          disabled={busy}
          onPress={() => act(`${base}/copy`, "POST", undefined, `Copy sent to ${me?.email ?? "you"}`)}
        />
      )}
      {!isVoid && (
        <View style={styles.links}>
          <LinkAction t={t} icon="document-text-outline" title="PDF" onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/api/public/invoices/${inv.public_token}/pdf`)} />
          <LinkAction t={t} icon="open-outline" title="Public page" onPress={() => WebBrowser.openBrowserAsync(publicUrl)} />
          <LinkAction
            t={t}
            icon={copied ? "checkmark" : "copy-outline"}
            title={copied ? "Copied" : "Copy link"}
            onPress={async () => {
              await Clipboard.setStringAsync(publicUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        </View>
      )}

      {isDraft && (
        <Card style={{ gap: 10 }}>
          <View style={styles.dates}>
            <View style={{ flex: 1 }}>
              <Label>Issue date</Label>
              <DayField value={fields.issue_date} onChange={(issue_date) => setFields({ ...fields, issue_date })} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Due date</Label>
              <DayField value={fields.due_date} onChange={(due_date) => setFields({ ...fields, due_date })} />
            </View>
          </View>
          <Label>Notes</Label>
          <TextInput
            value={fields.notes}
            onChangeText={(notes) => setFields({ ...fields, notes })}
            multiline
            placeholder="Thanks for your business."
            placeholderTextColor={t.muted}
            style={[...input, { minHeight: 64, textAlignVertical: "top" }]}
          />
          <Button title="Save details" kind="secondary" disabled={busy} onPress={saveFields} />
        </Card>
      )}

      {!isVoid && (
        <Card style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }}>Show daily hours grid</Text>
            <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
              Adds a day-by-day grid of hours above the services. Hours only, with no amounts.
            </Text>
          </View>
          <Switch
            value={inv.show_weekly_breakdown}
            disabled={busy}
            trackColor={{ true: t.primary }}
            onValueChange={(v) => {
              act(base, "PATCH", { show_weekly_breakdown: v });
            }}
          />
        </Card>
      )}

      {isDraft && (
        <Card style={{ gap: 10 }}>
          <Text style={[styles.h2, { color: t.text }]}>Expenses</Text>
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 19 }}>Pass-through costs billed alongside your hours, such as software seats or travel.</Text>
          {expenses.map((e) => (
            <View key={e.id} style={[styles.expense, { borderColor: t.border }]}>
              <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>{e.description}</Text>
              <Text style={{ color: t.text, fontSize: 15, fontVariant: ["tabular-nums"] }}>{fmtMoney(e.amount, inv.currency)}</Text>
              <Pressable
                hitSlop={10}
                disabled={busy}
                accessibilityLabel={`Remove ${e.description}`}
                onPress={() => act(`${base}/lines/${e.id}`, "DELETE", undefined)}
              >
                <Ionicons name="trash-outline" size={19} color={t.danger} />
              </Pressable>
            </View>
          ))}
          <TextInput
            value={expense.description}
            onChangeText={(description) => setExpense({ ...expense, description })}
            placeholder="Software subscription"
            placeholderTextColor={t.muted}
            style={input}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={expense.amount}
              onChangeText={(amount) => setExpense({ ...expense, amount })}
              placeholder="200.00"
              placeholderTextColor={t.muted}
              keyboardType="decimal-pad"
              accessibilityLabel="Expense amount"
              style={[...input, { flex: 1 }]}
            />
            <View style={{ flex: 1 }}>
              <Button title="Add expense" kind="secondary" disabled={busy || !expense.description.trim() || !expense.amount} onPress={addExpense} />
            </View>
          </View>
        </Card>
      )}

      <InvoiceView invoice={inv} sender={me?.name || me?.email || ""} senderEmail={me?.email ?? ""} />

      {(isDraft || isSent) && <Button title="Void invoice" kind="danger" disabled={busy} onPress={voidIt} />}
      {isDraft && <Button title="Delete draft" kind="danger" disabled={busy} onPress={remove} />}
    </ScrollView>
  );
}

function LinkAction({ t, icon, title, onPress }: { t: Theme; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress} hitSlop={6}>
      <Ionicons name={icon} size={17} color={t.primary} />
      <Text style={{ color: t.primary, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

/** The invoice as the client sees it, laid out for a phone. */
function InvoiceView({ invoice: inv, sender, senderEmail }: { invoice: Invoice; sender: string; senderEmail: string }) {
  const t = useTheme();
  const grouped = groupTimeLines(inv.lines);
  const weeks = weeklyBreakdown(inv.lines);
  const sums = invoiceTotals(inv.lines);
  const money = (n: number | string) => fmtMoney(n, inv.currency);
  const cap = [styles.cap, { color: t.muted }];
  return (
    <Card style={{ gap: 18 }}>
      <View style={styles.line}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{sender}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{senderEmail}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "800", letterSpacing: 1 }}>INVOICE</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>Issued {fmtDay(inv.issue_date)}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>Due {fmtDay(inv.due_date)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={cap}>Bill to</Text>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{inv.client_name}</Text>
          {inv.client_contact_name && <Text style={{ color: t.text, fontSize: 14 }}>{inv.client_contact_name}</Text>}
          {inv.client_address && <Text style={{ color: t.text, fontSize: 14 }}>{inv.client_address}</Text>}
          {inv.client_billing_email && <Text style={{ color: t.muted, fontSize: 14 }}>{inv.client_billing_email}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cap}>Period</Text>
          <Text style={{ color: t.text, fontSize: 14 }}>
            {fmtDay(inv.period_start)} to {fmtDay(inv.period_end)}
          </Text>
        </View>
      </View>

      {inv.show_weekly_breakdown && weeks.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={cap}>Hours</Text>
          <View style={styles.gridRow}>
            {DAYS.map((d, i) => (
              <Text key={i} style={[styles.gridCell, { color: t.muted, fontWeight: "600" }]}>{d}</Text>
            ))}
            <Text style={[styles.gridTotal, { color: t.muted, fontWeight: "600" }]}>Total</Text>
          </View>
          {weeks.map((w) => (
            <View key={w.weekStart} style={{ gap: 2 }}>
              <Text style={{ color: t.muted, fontSize: 12 }}>{fmtSpan(w.weekStart, w.weekEnd)}</Text>
              <View style={styles.gridRow}>
                {w.days.map((h, i) => {
                  const d = addDays(w.weekStart, i);
                  const outside = d < inv.period_start || d > inv.period_end;
                  return (
                    <Text key={i} style={[styles.gridCell, { color: outside ? t.muted : t.text, backgroundColor: outside ? t.bg : "transparent" }]}>
                      {dayHours(h)}
                    </Text>
                  );
                })}
                <Text style={[styles.gridTotal, { color: t.text }]}>{w.hours.toFixed(2)}</Text>
              </View>
            </View>
          ))}
          <Text style={{ color: t.muted, fontSize: 12 }}>Shaded days fall outside the billing period.</Text>
        </View>
      )}

      {grouped.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={cap}>Services</Text>
          {grouped.map((g) => (
            <View key={`${g.description}-${g.rate}`} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15 }}>{g.description}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>
                  {fmtSpan(g.firstDate, g.lastDate)} · {g.hours.toFixed(2)}h × {g.rate.toFixed(2)}
                </Text>
              </View>
              <Text style={[styles.money, { color: t.text }]}>{g.amount.toFixed(2)}</Text>
            </View>
          ))}
          <View style={[styles.item, styles.subtotal, { borderColor: t.border }]}>
            <Text style={{ color: t.text, fontWeight: "600", flex: 1 }}>Services subtotal · {sums.hours.toFixed(2)}h</Text>
            <Text style={[styles.money, { color: t.text, fontWeight: "600" }]}>{money(sums.timeAmount)}</Text>
          </View>
        </View>
      )}

      {sums.expenses.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={cap}>Expenses</Text>
          {sums.expenses.map((e) => (
            <View key={e.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15 }}>{e.description}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{fmtDay(e.line_date)}</Text>
              </View>
              <Text style={[styles.money, { color: t.text }]}>{parseFloat(e.amount).toFixed(2)}</Text>
            </View>
          ))}
          <View style={[styles.item, styles.subtotal, { borderColor: t.border }]}>
            <Text style={{ color: t.text, fontWeight: "600", flex: 1 }}>Expenses subtotal</Text>
            <Text style={[styles.money, { color: t.text, fontWeight: "600" }]}>{money(sums.expenseAmount)}</Text>
          </View>
        </View>
      )}

      <View style={[styles.item, styles.total, { borderColor: t.text }]}>
        <Text style={{ color: t.text, fontWeight: "700", flex: 1, letterSpacing: 0.5 }}>TOTAL DUE</Text>
        <Text style={[styles.money, { color: t.text, fontSize: 20, fontWeight: "800" }]}>{money(inv.subtotal)}</Text>
      </View>

      {inv.notes && (
        <View>
          <Text style={cap}>Notes</Text>
          <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }}>{inv.notes}</Text>
        </View>
      )}
    </Card>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  h2: { fontSize: 18, fontWeight: "700" },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  number: { fontSize: 18, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  links: { flexDirection: "row", justifyContent: "center", gap: 22, paddingVertical: 4 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  dates: { flexDirection: "row", gap: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  expense: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  cap: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  gridRow: { flexDirection: "row", alignItems: "center" },
  gridCell: { flex: 1, textAlign: "center", fontSize: 13, paddingVertical: 3, fontVariant: ["tabular-nums"], borderRadius: 4 },
  gridTotal: { width: 52, textAlign: "right", fontSize: 13, fontVariant: ["tabular-nums"] },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  money: { fontSize: 15, fontVariant: ["tabular-nums"] },
  subtotal: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  total: { borderTopWidth: 2, paddingTop: 12, alignItems: "center" },
});
