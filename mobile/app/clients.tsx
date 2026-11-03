import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { type Client, errorText, fmtHours, fmtMoney, looksLikeEmail, splitEmails } from "@/lib/invoicing";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

const EMPTY = {
  name: "",
  contact_name: "",
  billing_email: "",
  address: "",
  hourly_rate: "",
  currency: "USD",
  payment_terms_days: "30",
  match_keywords: "",
  auto_invoice_monthly: false,
};

type Draft = typeof EMPTY & { id: string | null };

export default function Clients() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const off = me?.invoicing_enabled === false;
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setClients(await api<Client[]>("/api/clients"));
      setError(null);
    } catch (e) {
      setError(errorText(e, "Couldn't load your clients."));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      if (!off) load();
    }, [load, off])
  );

  function edit(c: Client) {
    setDraft({
      id: c.id,
      name: c.name,
      contact_name: c.contact_name ?? "",
      billing_email: c.billing_email ?? "",
      address: c.address ?? "",
      hourly_rate: c.hourly_rate,
      currency: c.currency,
      payment_terms_days: String(c.payment_terms_days),
      match_keywords: c.match_keywords ?? "",
      auto_invoice_monthly: c.auto_invoice_monthly,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return Alert.alert("Add the company name", "It goes on every invoice.");
    if (!draft.hourly_rate.trim() || !(parseFloat(draft.hourly_rate) >= 0)) return Alert.alert("Add an hourly rate", "For example: 150.");
    if (!/^[A-Za-z]{3}$/.test(draft.currency.trim())) return Alert.alert("Check the currency", "Use a three-letter code, like USD or EUR.");
    setSaving(true);
    const body = JSON.stringify({
      name: draft.name.trim(),
      contact_name: draft.contact_name.trim() || null,
      billing_email: splitEmails(draft.billing_email).join(", ") || null,
      address: draft.address.trim() || null,
      hourly_rate: draft.hourly_rate.trim(),
      currency: draft.currency.trim().toUpperCase(),
      payment_terms_days: Number(draft.payment_terms_days) || 0,
      match_keywords: draft.match_keywords.trim() || null,
      auto_invoice_monthly: draft.auto_invoice_monthly,
    });
    try {
      await api(draft.id ? `/api/clients/${draft.id}` : "/api/clients", { method: draft.id ? "PATCH" : "POST", body });
      setDraft(null);
      await load();
    } catch (e) {
      Alert.alert("Not saved", errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string, name: string) {
    Alert.alert(`Delete ${name}?`, "This also deletes their time entries and invoices.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/api/clients/${id}`, { method: "DELETE" });
            setDraft(null);
            await load();
          } catch (e) {
            Alert.alert("Not deleted", errorText(e));
          }
        },
      },
    ]);
  }

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          draft || off || !clients ? null : (
            <Pressable onPress={() => setDraft({ ...EMPTY, id: null })} hitSlop={10} accessibilityLabel="New client">
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
    const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }];
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    const emails = splitEmails(draft.billing_email);
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {header}
        <Text style={{ color: t.muted, fontSize: 15 }}>Billing details appear on invoices.</Text>
        <Label>Company name</Label>
        <TextInput value={draft.name} onChangeText={(name) => set({ name })} placeholder="Acme Inc." placeholderTextColor={t.muted} style={input} />
        <Label>Contact name</Label>
        <TextInput value={draft.contact_name} onChangeText={(contact_name) => set({ contact_name })} placeholderTextColor={t.muted} style={input} />
        <Label>Billing emails</Label>
        <TextInput
          value={draft.billing_email}
          onChangeText={(billing_email) => set({ billing_email })}
          placeholder="ap@acme.com, jane@acme.com"
          placeholderTextColor={t.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={input}
        />
        {emails.length > 0 && (
          <View style={styles.chips}>
            {emails.map((e) => {
              const ok = looksLikeEmail(e);
              return (
                <View key={e} style={[styles.chip, { borderColor: ok ? t.border : t.danger, backgroundColor: t.card }]}>
                  <Text style={{ color: ok ? t.text : t.danger, fontSize: 13 }} numberOfLines={1}>{e}</Text>
                </View>
              );
            })}
          </View>
        )}
        <Text style={[styles.hint, { color: t.muted }]}>Separate addresses with commas. You pick who gets each invoice when you send it.</Text>
        <Label>Address</Label>
        <TextInput
          value={draft.address}
          onChangeText={(address) => set({ address })}
          multiline
          placeholderTextColor={t.muted}
          style={[...input, { minHeight: 84, textAlignVertical: "top" }]}
        />
        <View style={styles.three}>
          <View style={{ flex: 1.2 }}>
            <Label>Rate / hr</Label>
            <TextInput value={draft.hourly_rate} onChangeText={(hourly_rate) => set({ hourly_rate })} placeholder="150" placeholderTextColor={t.muted} keyboardType="decimal-pad" style={input} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Currency</Label>
            <TextInput
              value={draft.currency}
              onChangeText={(currency) => set({ currency: currency.toUpperCase() })}
              maxLength={3}
              autoCapitalize="characters"
              autoCorrect={false}
              style={input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Net days</Label>
            <TextInput value={draft.payment_terms_days} onChangeText={(payment_terms_days) => set({ payment_terms_days: payment_terms_days.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={3} style={input} />
          </View>
        </View>
        <Label>Calendar keywords</Label>
        <TextInput
          value={draft.match_keywords}
          onChangeText={(match_keywords) => set({ match_keywords })}
          placeholder="acme, standup"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          style={input}
        />
        <Text style={[styles.hint, { color: t.muted }]}>Comma-separated. Calendar events whose title contains one of these can be imported as time entries.</Text>
        <Card style={styles.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }}>Auto-draft monthly invoice</Text>
            <Text style={[styles.hint, { color: t.muted, marginTop: 2 }]}>On the 1st, last month's unbilled hours become a draft invoice for you to review and send.</Text>
          </View>
          <Switch value={draft.auto_invoice_monthly} onValueChange={(auto_invoice_monthly) => set({ auto_invoice_monthly })} trackColor={{ true: t.primary }} />
        </Card>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button title="Cancel" kind="secondary" onPress={() => setDraft(null)} /></View>
          <View style={{ flex: 1 }}><Button title="Save" busy={saving} onPress={save} /></View>
        </View>
        {draft.id && <Button title="Delete client" kind="danger" onPress={() => remove(draft.id!, draft.name)} />}
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
      {!clients && !error && <ActivityIndicator style={{ marginTop: 24 }} />}
      {clients?.length === 0 && <Notice>No clients yet. Add the company you bill to get started.</Notice>}
      {clients?.map((c) => (
        <Pressable key={c.id} onPress={() => edit(c)} accessibilityRole="button" accessibilityHint="Edit client">
          {({ pressed }) => (
            <Card style={{ gap: 4, opacity: pressed ? 0.7 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: "600", flex: 1 }} numberOfLines={1}>{c.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={t.muted} />
              </View>
              {c.contact_name && <Text style={{ color: t.muted, fontSize: 14 }}>{c.contact_name}</Text>}
              {c.billing_email && <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>{c.billing_email}</Text>}
              <Text style={{ color: t.text, fontSize: 14, marginTop: 6 }}>
                {fmtMoney(c.hourly_rate, c.currency)} / hr · Net {c.payment_terms_days}
              </Text>
              <Text style={{ color: t.muted, fontSize: 14 }}>
                Unbilled {fmtHours(c.unbilled_hours)} · {fmtMoney(c.unbilled_amount, c.currency)}
              </Text>
              {c.auto_invoice_monthly && (
                <View style={[styles.badge, { backgroundColor: t.primary + "22" }]}>
                  <Text style={{ color: t.primary, fontSize: 12, fontWeight: "600" }}>Auto-invoices monthly</Text>
                </View>
              )}
            </Card>
          )}
        </Pressable>
      ))}
      {clients && <Button title="New client" icon={<Ionicons name="add" size={20} color={t.primaryText} />} onPress={() => setDraft({ ...EMPTY, id: null })} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  three: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: "100%" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  hint: { fontSize: 13, lineHeight: 18 },
});
