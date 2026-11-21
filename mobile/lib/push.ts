import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask once for permission and return this phone's Expo push token, or null
 * (simulator, permission denied, no EAS project, or Android without Firebase). */
export async function pushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    // Android push needs FCM (android.googleServicesFile in app.json); without it, don't prompt.
    if (!Constants.expoConfig?.android?.googleServicesFile) return null;
    await Notifications.setNotificationChannelAsync("default", {
      name: "Bookings",
      // eslint-disable-next-line import/namespace -- exported via `export *` from a .types module the plugin doesn't follow
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}
