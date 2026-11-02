import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { Tabs, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useApi } from "@/lib/api";
import { pushToken } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { setSharedText } from "@/lib/shared-text";

export default function AppLayout() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  // Register this phone for booking notifications.
  useEffect(() => {
    pushToken()
      .then((token) => token && api("/api/me/push-devices", { method: "POST", body: JSON.stringify({ token, platform: Platform.OS }) }))
      .catch(() => undefined);
  }, [api]);

  // Tapping a notification opens its booking.
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const id = r?.notification.request.content.data?.booking_id;
      if (typeof id === "string") router.push({ pathname: "/booking/[id]", params: { id } });
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);

  // Text shared from another app ("Share → TimeIQ") goes to Import.
  useEffect(() => {
    if (!hasShareIntent) return;
    const text = [shareIntent.text, shareIntent.webUrl].filter(Boolean).join("\n").trim();
    if (text) {
      setSharedText(text);
      router.navigate("/import");
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Agenda", headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="import"
        options={{ title: "Import", tabBarIcon: ({ color, size }) => <Ionicons name="mail-unread-outline" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color as string} size={size} /> }}
      />
    </Tabs>
  );
}
