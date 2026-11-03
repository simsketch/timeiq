import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Input, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

type Alias = { id: string; email: string; verified_at: string | null; created_at: string };

const MAX = 10;

export default function EmailAddresses() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const [aliases, setAliases] = useState<Alias[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAliases(await api<Alias[]>("/api/email-aliases"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your addresses.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function change(path: string, method: "POST" | "DELETE", body?: object, done?: string) {
    setBusy(true);
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
      if (done) Alert.alert(done);
      return true;
    } catch (e) {
      Alert.alert("That didn't work", e instanceof Error ? e.message : "Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
        TimeIQ acts on schedules you forward, and on threads you cc it on, only from {me?.email ?? "your account email"} and the addresses you
        link and confirm here.
      </Text>

      {error && <Notice tone="error">{error}</Notice>}
      {!aliases && !error && <ActivityIndicator style={{ marginTop: 16 }} />}

      {aliases && (
        <Card style={{ gap: 14 }}>
          {aliases.length === 0 && <Text style={{ color: t.muted }}>No linked addresses yet.</Text>}
          {aliases.map((a) => (
            <View key={a.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 16 }} numberOfLines={1}>{a.email}</Text>
                <Text style={{ color: a.verified_at ? "#10b981" : t.muted, fontSize: 13, marginTop: 2 }}>{a.verified_at ? "Confirmed" : "Waiting for confirmation"}</Text>
              </View>
              {!a.verified_at && (
                <Pressable hitSlop={8} disabled={busy} onPress={() => change(`/api/email-aliases/${a.id}/resend`, "POST", undefined, "Confirmation sent again")}>
                  <Text style={{ color: t.primary, fontWeight: "600" }}>Resend</Text>
                </Pressable>
              )}
              <Pressable
                hitSlop={8}
                disabled={busy}
                onPress={() =>
                  Alert.alert(`Unlink ${a.email}?`, "Emails from it stop reaching TimeIQ.", [
                    { text: "Keep", style: "cancel" },
                    { text: "Unlink", style: "destructive", onPress: () => change(`/api/email-aliases/${a.id}`, "DELETE") },
                  ])
                }
              >
                <Text style={{ color: t.danger, fontWeight: "600" }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {aliases && aliases.length < MAX && (
        <View style={{ gap: 8 }}>
          <Label>Link another address</Label>
          <Input value={email} onChangeText={setEmail} placeholder="you@work.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <Button
            title="Send confirmation"
            busy={busy}
            disabled={!email.trim()}
            onPress={async () => {
              if (await change("/api/email-aliases", "POST", { email: email.trim() }, `Check ${email.trim()} for a confirmation link.`)) setEmail("");
            }}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  item: { flexDirection: "row", alignItems: "center", gap: 14 },
});
