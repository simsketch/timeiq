import { carriesCredentials } from "@/lib/analytics-url";

const KEY = "timeiq.first-ad-visit";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export type SignupAttribution = { utm_source: string; captured_at: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string; ad_id?: string };

export function readAttribution(storage: Storage, now = Date.now()): SignupAttribution | null {
  try {
    const data = JSON.parse(storage.getItem(KEY) || "null");
    const captured = Date.parse(data?.captured_at);
    if (typeof data?.utm_source === "string" && captured <= now && now - captured <= MAX_AGE) return data;
    storage.removeItem(KEY);
  } catch { /* Storage can be disabled. */ }
  return null;
}

/** Keep only campaign labels, never the full URL, referrer, or click credentials. */
export function captureAttribution(href: string, storage: Storage, now = Date.now()) {
  const url = new URL(href);
  if (carriesCredentials(url) || readAttribution(storage, now)) return;
  const source = url.searchParams.get("utm_source")?.trim();
  if (!source) return;
  const data: SignupAttribution = { utm_source: source.slice(0, 160), captured_at: new Date(now).toISOString() };
  for (const key of ["utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const value = url.searchParams.get(key)?.trim();
    if (value) data[key] = value.slice(0, 160);
  }
  const adId = url.searchParams.get("ad_id");
  if (adId && /^\d{1,64}$/.test(adId)) data.ad_id = adId;
  try { storage.setItem(KEY, JSON.stringify(data)); } catch { /* The app works without attribution. */ }
}
