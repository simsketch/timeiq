import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

export default function SignIn() {
  const t = useTheme();
  const { startHostedAuth } = useHostedAuth();
  const [busy, setBusy] = useState<"sign-in" | "sign-up" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(mode: "sign-in" | "sign-up") {
    setBusy(mode);
    setError(null);
    try {
      // Clerk's hosted page handles Google, email and password, and sign-up;
      // the session it creates is activated when the sheet closes.
      await startHostedAuth({ mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in didn't finish. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <View style={styles.hero}>
        <Image source={require("@/assets/icon.png")} style={styles.logo} />
        <Text style={[styles.title, { color: t.text }]}>TimeIQ</Text>
        <Text style={[styles.tagline, { color: t.muted }]}>
          Your bookings, calendars and schedules in one place.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => go("sign-in")}
          disabled={!!busy}
          style={({ pressed }) => [styles.primary, { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          {busy === "sign-in" ? <ActivityIndicator color={t.primaryText} /> : <Text style={[styles.primaryText, { color: t.primaryText }]}>Sign in</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => go("sign-up")}
          disabled={!!busy}
          style={({ pressed }) => [styles.secondary, { borderColor: t.border, backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}
        >
          {busy === "sign-up" ? <ActivityIndicator color={t.text} /> : <Text style={[styles.secondaryText, { color: t.text }]}>Create an account</Text>}
        </Pressable>
        {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "space-between", padding: 24 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  logo: { width: 96, height: 96, borderRadius: 22 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  tagline: { fontSize: 17, textAlign: "center", maxWidth: 300, lineHeight: 24 },
  actions: { gap: 12, paddingBottom: 12 },
  primary: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 17, fontWeight: "600" },
  secondary: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  secondaryText: { fontSize: 17, fontWeight: "600" },
  error: { textAlign: "center", fontSize: 14 },
});
