import { useAuth, useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Button, Card, Label, Row } from "@/components/ui";
import { useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { pushToken } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { forgetMe, useMe } from "@/lib/use-me";

export default function Account() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const router = useRouter();
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

      <Card style={{ paddingVertical: 6 }}>
        <Row icon="albums-outline" title="Event types" detail="Your meeting kinds, rules, reminders and prices" onPress={() => router.push("/event-types")} />
        <Row icon="time-outline" title="Availability" detail="The hours people can book you" onPress={() => router.push("/availability")} />
        <Row icon="calendar-outline" title="Calendars" detail="Connect and sync the calendars that block your times" onPress={() => router.push("/calendars")} />
        <Row icon="settings-outline" title="Settings" detail="Profile, time zone, booking page, billing, AI assistants" onPress={() => router.push("/settings")} />
      </Card>

      {me?.invoicing_enabled && (
        <Card style={{ paddingVertical: 6 }}>
          <Row icon="stopwatch-outline" title="Time" detail="Your timesheet" onPress={() => router.push("/time")} />
          <Row icon="briefcase-outline" title="Clients" detail="Rates and billing details" onPress={() => router.push("/clients")} />
          <Row icon="document-text-outline" title="Invoices" detail="Create, send and track invoices" onPress={() => router.push("/invoices")} />
        </Card>
      )}

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
