"use client";

import { track } from "@vercel/analytics";
import { useTranslations } from "next-intl";
import { appStoreUrl } from "@/lib/app-store";

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
