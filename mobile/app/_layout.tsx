import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/config";
import { useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Routes() {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useTheme();
  useEffect(() => {
    if (isLoaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [isLoaded]);
  if (!isLoaded) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text },
          contentStyle: { backgroundColor: t.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!isSignedIn}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="booking/[id]" options={{ title: "Booking", headerBackTitle: "Back" }} />
          <Stack.Screen name="new-booking" options={{ title: "New booking", presentation: "modal" }} />
          <Stack.Screen name="calendars" options={{ title: "Calendars", headerBackTitle: "Account" }} />
          <Stack.Screen name="availability" options={{ title: "Availability", headerBackTitle: "Account" }} />
          <Stack.Screen name="event-types" options={{ title: "Event types", headerBackTitle: "Account" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <Routes />
      </ClerkProvider>
    </ShareIntentProvider>
  );
}
