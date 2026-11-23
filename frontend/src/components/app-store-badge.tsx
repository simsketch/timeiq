"use client";

import { track } from "@vercel/analytics";
import { useTranslations } from "next-intl";
import { appStoreUrl, playStoreUrl } from "@/lib/app-store";

/** Apple's official badge (it must not be redrawn); clicks are counted in Vercel Analytics and GA by placement. */
export function AppStoreBadge({ placement, className = "h-12 w-auto" }: { placement: string; className?: string }) {
  const t = useTranslations("shell");
  // shortcut: Apple's English badge art everywhere; add localized badge SVGs from Apple's marketing site when a locale needs one.
  return (
    <a
      href={appStoreUrl(`website-${placement}`)}
      target="_blank"
      rel="noopener"
      onClick={() => {
        track("app_store_click", { placement });
        (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "app_store_click", { placement });
      }}
      aria-label={t("appStoreLabel")}
      className="inline-flex shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization to gain */}
      <img src="/app-store-badge.svg" alt={t("appStoreAlt")} width={120} height={40} className={className} />
    </a>
  );
}

/** Google's official "Get it on Google Play" badge, sized to match the App Store one. */
export function GooglePlayBadge({ placement, className = "h-12 w-auto" }: { placement: string; className?: string }) {
  const t = useTranslations("shell");
  return (
    <a
      href={playStoreUrl(`website-${placement}`)}
      target="_blank"
      rel="noopener"
      onClick={() => {
        track("play_store_click", { placement });
        (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "play_store_click", { placement });
      }}
      aria-label={t("playStoreLabel")}
      className="inline-flex shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization to gain */}
      <img src="/google-play-badge.svg" alt={t("playStoreAlt")} width={135} height={40} className={className} />
    </a>
  );
}

/** Both store badges side by side. */
export function StoreBadges({ placement, className }: { placement: string; className?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <AppStoreBadge placement={placement} className={className} />
      <GooglePlayBadge placement={placement} className={className} />
    </div>
  );
}
