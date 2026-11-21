import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { type Href, Tabs, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useFold } from "@/components/ui";
import { useApi } from "@/lib/api";
import { pushToken } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { setSharedText } from "@/lib/shared-text";

export default function AppLayout() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const fold = useFold();

  // Register this phone for booking notifications.
  useEffect(() => {
    pushToken()
      .then((token) => token && api("/api/me/push-devices", { method: "POST", body: JSON.stringify({ token, platform: Platform.OS }) }))
      .catch(() => undefined);
  }, [api]);

  // Tapping a notification opens its booking, or the screen a tip is about.
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const data = r?.notification.request.content.data;
      const id = data?.booking_id;
      if (typeof id === "string") router.push({ pathname: "/booking/[id]", params: { id } });
      else if (typeof data?.path === "string" && data.path.startsWith("/")) router.navigate(data.path as Href);
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
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        // Unfolded Duo held like a book: three tabs left of the fold, two right of it. The root stack already pads by the side insets.
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border, ...(fold?.x && { paddingLeft: 0, paddingRight: 0 }) },
        tabBarItemStyle: fold?.x && ["index", "bookings", "meetings"].includes(route.name) ? { flex: 0, width: fold.x / 3 } : undefined,
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.bg },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Agenda", headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="meetings"
        options={{ title: "Meetings", tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color as string} size={size} /> }}
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
