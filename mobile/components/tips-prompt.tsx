import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button, Card } from "@/components/ui";
import { type Me, useApi } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { rememberMe, useMe } from "@/lib/use-me";

/** One-time question asking new free and trial accounts whether they want
 * feature tips by push. Apple rule 4.5.4 needs this explicit consent before
 * any promotional push; the answer can be changed in Settings. */
export function TipsPrompt() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState<boolean | null>(null);

  useEffect(() => {
    if (!me?.push_tips_offer) return;
    Notifications.getPermissionsAsync()
      .then((p) => setAllowed(p.status === "granted"))
      .catch(() => undefined);
  }, [me?.push_tips_offer]);

  if (!me?.push_tips_offer || !allowed) return null;

  async function answer(yes: boolean) {
    setBusy(yes);
    try {
      const next = await api<Me>("/api/me", { method: "PATCH", body: JSON.stringify({ push_tips_opt_in: yes }) });
      rememberMe({ ...me!, ...next });
    } catch (e) {
      Alert.alert("Not saved", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>Get a quick tip each day for your first week?</Text>
      <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
        We&apos;ll send a few tips about TimeIQ features. Turn them off anytime in Account.
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button title="Yes, send tips" busy={busy === true} onPress={() => answer(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Not now" kind="secondary" busy={busy === false} onPress={() => answer(false)} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
});
