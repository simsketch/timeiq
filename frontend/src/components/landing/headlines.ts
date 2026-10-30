export type Headline = { id: string; lead: string; accent: string };

// Each ad's landing headline repeats the promise that ad made. Meta fills
// utm_content with the ad's name, e.g. "G-all-calendars".
export const HEADLINES = {
  default: { id: "forward-schedule", lead: "Forward any schedule.", accent: "It’s on your calendar." },
  "all-calendars": { id: "all-calendars", lead: "All your calendars.", accent: "One booking link." },
  "no-upsells": { id: "no-upsells", lead: "Scheduling for $19 a year.", accent: "No upsells, ever." },
} satisfies Record<string, Headline>;

export type HeadlineVariant = Exclude<keyof typeof HEADLINES, "default">;
export const HEADLINE_VARIANTS = Object.keys(HEADLINES).filter((k) => k !== "default") as HeadlineVariant[];

/** The variant an ad's utm_content points at, if any. */
export function variantForAd(utmContent: string | null): HeadlineVariant | null {
  const name = (utmContent ?? "").toLowerCase();
  return HEADLINE_VARIANTS.find((v) => name.includes(v)) ?? null;
}
