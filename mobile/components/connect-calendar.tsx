import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export type Provider = "google" | "microsoft";

const NAMES: Record<Provider, string> = { google: "Google Calendar", microsoft: "Outlook" };
const FAILED: Record<string, string> = {
  denied: "You didn't allow access, so nothing was connected.",
  admin: "Your organization needs an admin to approve TimeIQ before you can connect Outlook.",
  expired: "That sign-in took too long. Try again.",
  failed: "The sign-in didn't finish. Try again.",
};

const base64url = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Connect (or reconnect) Google or Outlook in the system sign-in sheet. The
 * app keeps a secret and sends only its hash; the server connects the calendar
 * only when this signed-in app comes back with the secret. */
export function useCalendarConnect(onConnected: () => void) {
  const api = useApi();
  const [enabled, setEnabled] = useState<Record<Provider, boolean>>({ google: false, microsoft: false });
  const [busy, setBusy] = useState<Provider | null>(null);

  useEffect(() => {
    api<{ enabled: boolean }>("/api/google/status").then((s) => setEnabled((e) => ({ ...e, google: s.enabled }))).catch(() => undefined);
    api<{ enabled: boolean }>("/api/microsoft/status").then((s) => setEnabled((e) => ({ ...e, microsoft: s.enabled }))).catch(() => undefined);
  }, [api]);

  async function connect(provider: Provider) {
    setBusy(provider);
    try {
      const bytes = Crypto.getRandomBytes(48);
      const verifier = base64url(btoa(String.fromCharCode(...bytes)));
      const challenge = base64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
      const { url } = await api<{ url: string }>(`/api/calendar-connect/${provider}/start`, { method: "POST", body: JSON.stringify({ challenge }) });
      const result = await WebBrowser.openAuthSessionAsync(url, "timeiq://calendars");
      if (result.type !== "success") return;
      const query = Linking.parse(result.url).queryParams ?? {};
      const handoff = typeof query.handoff === "string" ? query.handoff : null;
      if (!handoff) {
        Alert.alert(`${NAMES[provider]} not connected`, FAILED[typeof query.outcome === "string" ? query.outcome : "failed"] ?? FAILED.failed);
        return;
      }
      const done = await api<{ name: string }>("/api/calendar-connect/finish", { method: "POST", body: JSON.stringify({ handoff, verifier }) });
      Alert.alert("Connected", `${done.name} now blocks your booking times.`);
      onConnected();
    } catch (e) {
      Alert.alert(`${NAMES[provider]} not connected`, e instanceof Error ? e.message : FAILED.failed);
    } finally {
      setBusy(null);
    }
  }

  return { enabled, busy, connect };
}

export function ConnectCalendar({ onConnected }: { onConnected: () => void }) {
  const t = useTheme();
  const { enabled, busy, connect } = useCalendarConnect(onConnected);
  if (!enabled.google && !enabled.microsoft) return null;
  return (
    <View style={{ gap: 10 }}>
      {enabled.google && (
        <Button title="Connect Google Calendar" kind="secondary" busy={busy === "google"} disabled={!!busy} icon={<Ionicons name="logo-google" size={18} color={t.text} />} onPress={() => connect("google")} />
      )}
      {enabled.microsoft && (
        <Button title="Connect Outlook" kind="secondary" busy={busy === "microsoft"} disabled={!!busy} icon={<Ionicons name="logo-microsoft" size={18} color={t.text} />} onPress={() => connect("microsoft")} />
      )}
    </View>
  );
}
