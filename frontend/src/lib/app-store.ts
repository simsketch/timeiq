export const APP_STORE_ID = "6835677809";

/** The App Store listing, tagged with an App Store Connect campaign (App Analytics > Campaigns). */
export function appStoreUrl(campaign: string) {
  // shortcut: no pt= provider token yet, so App Analytics won't attribute these; add pt from App Store Connect's campaign link generator.
  return `https://apps.apple.com/app/id${APP_STORE_ID}?ct=${encodeURIComponent(campaign)}&mt=8`;
}
