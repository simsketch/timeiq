"use client";

import { track } from "@vercel/analytics";
import { appStoreUrl } from "@/lib/app-store";

/** Apple's official badge (it must not be redrawn); clicks are counted in Vercel Analytics and GA by placement. */
export function AppStoreBadge({ placement, className = "h-12 w-auto" }: { placement: string; className?: string }) {
  return (
    <a
      href={appStoreUrl(`website-${placement}`)}
      target="_blank"
      rel="noopener"
      onClick={() => {
        track("app_store_click", { placement });
        (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "app_store_click", { placement });
      }}
      aria-label="Download TimeIQ on the App Store"
      className="inline-flex shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization to gain */}
      <img src="/app-store-badge.svg" alt="Download on the App Store" width={120} height={40} className={className} />
    </a>
  );
}
