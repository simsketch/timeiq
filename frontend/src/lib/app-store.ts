export const APP_STORE_ID = "6835677809";
export const PLAY_PACKAGE = "app.timeiq";

/** The Google Play listing; the referrer shows up as the campaign in Play Console's acquisition reports. */
export function playStoreUrl(campaign: string) {
  const referrer = `utm_source=website&utm_campaign=${campaign}`;
  return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}&referrer=${encodeURIComponent(referrer)}`;
}

/** The App Store listing, tagged with an App Store Connect campaign (App Analytics > Campaigns). */
export function appStoreUrl(campaign: string) {
  // shortcut: no pt= provider token yet, so App Analytics won't attribute these; add pt from App Store Connect's campaign link generator.
  return `https://apps.apple.com/app/id${APP_STORE_ID}?ct=${encodeURIComponent(campaign)}&mt=8`;
}
