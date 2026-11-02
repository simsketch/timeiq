import { useAuth, useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Button, Card, Label } from "@/components/ui";
import { useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { pushToken } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { forgetMe, useMe } from "@/lib/use-me";

export default function Account() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const { user } = useUser();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState<"out" | "delete" | null>(null);
  const [copied, setCopied] = useState(false);
  const link = me ? `${SITE_URL}/book/${me.username}` : null;

  async function leave() {
    // Stop this phone getting the account's notifications.
    const token = await pushToken().catch(() => null);
    if (token) await api("/api/me/push-devices/remove", { method: "POST", body: JSON.stringify({ token }) }).catch(() => undefined);
    await Notifications.setBadgeCountAsync(0).catch(() => undefined);
    forgetMe();
    await signOut();
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This deletes your TimeIQ account and everything in it: bookings, calendars, time entries and invoices. Upcoming bookings are cancelled and guests are told. Any subscription is cancelled. This can't be undone.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            try {
              await api("/api/me", { method: "DELETE" });
              forgetMe();
              await signOut().catch(() => undefined);
            } catch (e) {
              Alert.alert("Not deleted", e instanceof Error ? e.message : "Try again in a few minutes.");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.profile}>
        {user?.imageUrl ? <Image source={{ uri: user.imageUrl }} style={styles.avatar} /> : <Ionicons name="person-circle" size={64} color={t.muted} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: t.text }]}>{me?.name || user?.fullName || "Your account"}</Text>
          <Text style={{ color: t.muted, fontSize: 15 }}>{me?.email ?? user?.primaryEmailAddress?.emailAddress}</Text>
          {me && <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>{me.timezone.replace(/_/g, " ")}</Text>}
        </View>
      </View>

      {link && (
        <Card style={{ gap: 12 }}>
          <Label>Your booking link</Label>
          <Text style={{ color: t.text, fontSize: 16 }} selectable>
            {link.replace(/^https:\/\//, "")}
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Share" icon={<Ionicons name="share-outline" size={18} color={t.primaryText} />} onPress={() => Share.share({ message: link, url: link })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={copied ? "Copied" : "Copy"}
                kind="secondary"
                icon={<Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={t.text} />}
                onPress={async () => {
                  await Clipboard.setStringAsync(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              />
            </View>
          </View>
        </Card>
      )}

      <Card style={{ gap: 12 }}>
        <Label>More on the web</Label>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          Availability, event types, calendars, time tracking and invoices are at timeiq.app.
        </Text>
        <Button title="Open timeiq.app" kind="secondary" icon={<Ionicons name="open-outline" size={18} color={t.text} />} onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/dashboard`)} />
      </Card>

      <Button title="Sign out" kind="secondary" busy={busy === "out"} onPress={async () => { setBusy("out"); await leave(); setBusy(null); }} />
      <Button title="Delete account" kind="danger" busy={busy === "delete"} onPress={confirmDelete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  name: { fontSize: 22, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
});
