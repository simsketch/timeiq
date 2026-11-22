import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import { SCREENSHOT_MODE } from "./config";
import { getPref, setPref } from "./prefs";

const MIN_DAYS = 3;
const MIN_BOOKINGS = 3;

/** Whether this device has earned a review ask. Pure, so it's easy to check. */
export function shouldAsk(days: string[], bookings: number, askedVersion: string | null, version: string): boolean {
  return days.length >= MIN_DAYS && bookings >= MIN_BOOKINGS && askedVersion !== version;
}

/** Asks for a store rating with the system sheet once someone has used the app
 * on 3 different days and has 3 bookings, at most once per app version. iOS and
 * Android throttle the sheet further and may show nothing. */
export async function maybeAskForReview(bookings: number): Promise<void> {
  if (SCREENSHOT_MODE) return;
  const today = new Date().toISOString().slice(0, 10);
  let days: string[] = [];
  try {
    days = JSON.parse((await getPref("review.days")) ?? "[]");
  } catch {}
  if (!days.includes(today)) {
    days = [...days, today].slice(-MIN_DAYS);
    setPref("review.days", JSON.stringify(days));
  }
  const version = Constants.expoConfig?.version ?? "0";
  if (!shouldAsk(days, bookings, await getPref("review.asked"), version)) return;
  if (!(await StoreReview.hasAction().catch(() => false))) return;
  setPref("review.asked", version);
  StoreReview.requestReview().catch(() => undefined);
}
