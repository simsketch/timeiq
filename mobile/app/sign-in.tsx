import { useSignInWithApple } from "@clerk/expo/apple";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

export default function SignIn() {
  const t = useTheme();
  const scheme = useColorScheme();
  const { startHostedAuth } = useHostedAuth();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<"sign-in" | "sign-up" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable, () => {});
  }, []);

  async function apple() {
    setBusy("apple");
    setError(null);
    try {
      // Clerk's hook signs in or signs up (transfer included); cancel resolves with no session.
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in with Apple didn't finish. Try again.");
    } finally {
      setBusy(null);
    }
  }

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
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              scheme === "dark"
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={14}
            onPress={() => !busy && apple()}
            style={[styles.apple, { opacity: busy ? 0.5 : 1 }]}
          />
        )}
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
  apple: { width: "100%", height: 54 },
  primary: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 17, fontWeight: "600" },
  secondary: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  secondaryText: { fontSize: 17, fontWeight: "600" },
  error: { textAlign: "center", fontSize: 14 },
});
