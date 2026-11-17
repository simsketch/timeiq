import { Alert, Linking } from "react-native";
import { SCREENSHOT_MODE, SITE_URL } from "@/lib/config";
import { getPref, setPref } from "@/lib/prefs";

const KEY = "ai-consent";

/** Apple 5.1.2(i): ask once before any personal data goes to a third-party AI.
 * Resolves true when the person has agreed, now or earlier on this device. */
export async function confirmAiConsent(): Promise<boolean> {
  if (SCREENSHOT_MODE || (await getPref(KEY)) === "yes") return true;
  return new Promise((resolve) => {
    Alert.alert(
      "Use AI features?",
      "Ask TimeIQ and schedule import are powered by Claude, an AI model from Anthropic. " +
        "To answer, TimeIQ sends Anthropic your message or the schedule text, plus the calendar events, bookings, " +
        "clients and invoices it needs. Anthropic doesn't use this data to train its models.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Privacy policy", onPress: () => { Linking.openURL(`${SITE_URL}/privacy`); resolve(false); } },
        { text: "Allow", onPress: () => { setPref(KEY, "yes"); resolve(true); } },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
