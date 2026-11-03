import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Input, Label, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useTheme } from "@/lib/theme";

type Token = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };
type App = { id: string; client_name: string; created_at: string; last_used_at: string | null };

const MCP_URL = `${API_URL.replace(/\/$/, "")}/mcp`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never");

export default function ApiTokens() {
  const t = useTheme();
  const api = useApi();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tk, ap] = await Promise.all([api<Token[]>("/api/me/tokens"), api<App[]>("/api/me/connections")]);
      setTokens(tk);
      setApps(ap);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your tokens.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function copy(text: string, key: string) {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const out = await api<Token & { token: string }>("/api/me/tokens", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setFresh(out.token);
      setName("");
      await load();
    } catch (e) {
      Alert.alert("Not created", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  function revoke(title: string, path: string, verb: string) {
    Alert.alert(`${verb} ${title}?`, "It loses access to your TimeIQ account straight away.", [
      { text: "Keep", style: "cancel" },
      {
        text: verb,
        style: "destructive",
        onPress: async () => {
          try {
            await api(path, { method: "DELETE" });
            await load();
          } catch (e) {
            Alert.alert("That didn't work", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
        Connect TimeIQ to Claude, ChatGPT, Cursor or any MCP client, then ask things like &ldquo;when am I free Thursday?&rdquo;
      </Text>

      <Label>Connector URL</Label>
      <Card style={{ gap: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }}>For Claude and ChatGPT, add a custom connector with this URL, then sign in and allow. No token needed.</Text>
        <Pressable accessibilityRole="button" onPress={() => copy(MCP_URL, "url")} style={styles.copyRow}>
          <Text style={{ color: t.text, fontFamily: "Menlo", fontSize: 13, flex: 1 }} selectable>{MCP_URL}</Text>
          <Ionicons name={copied === "url" ? "checkmark" : "copy-outline"} size={18} color={t.primary} />
        </Pressable>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      {!tokens && !error && <ActivityIndicator style={{ marginTop: 16 }} />}

      {apps && (
        <>
          <Label>Connected apps</Label>
          <Card style={{ gap: 14 }}>
            {apps.length === 0 && <Text style={{ color: t.muted }}>No connected apps yet.</Text>}
            {apps.map((a) => (
              <View key={a.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 16 }} numberOfLines={1}>{a.client_name}</Text>
                  <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>Connected {when(a.created_at)} · last used {when(a.last_used_at)}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => revoke(a.client_name, `/api/me/connections/${a.id}`, "Disconnect")}>
                  <Text style={{ color: t.danger, fontWeight: "600" }}>Disconnect</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}

      {tokens && (
        <>
          <Label>Personal tokens</Label>
          <Card style={{ gap: 14 }}>
            <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>For Claude Code, Cursor and other clients that take a bearer token.</Text>
            {fresh && (
              <View style={{ gap: 8 }}>
                <Notice tone="warn">Copy this token now. TimeIQ won&apos;t show it again.</Notice>
                <Pressable accessibilityRole="button" onPress={() => copy(fresh, "fresh")} style={styles.copyRow}>
                  <Text style={{ color: t.text, fontFamily: "Menlo", fontSize: 12, flex: 1 }} selectable>{fresh}</Text>
                  <Ionicons name={copied === "fresh" ? "checkmark" : "copy-outline"} size={18} color={t.primary} />
                </Pressable>
              </View>
            )}
            {tokens.map((tk) => (
              <View key={tk.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 16 }} numberOfLines={1}>{tk.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>{tk.prefix}… · last used {when(tk.last_used_at)}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => revoke(tk.name, `/api/me/tokens/${tk.id}`, "Revoke")}>
                  <Text style={{ color: t.danger, fontWeight: "600" }}>Revoke</Text>
                </Pressable>
              </View>
            ))}
            <Input value={name} onChangeText={setName} placeholder="Token name, e.g. Claude Code" />
            <Button title="Create token" busy={busy} disabled={!name.trim()} onPress={create} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 48 },
  item: { flexDirection: "row", alignItems: "center", gap: 14 },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
});
