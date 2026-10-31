"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { MetaPixel } from "@/components/meta-pixel";
import { carriesCredentials, redactUrl } from "@/lib/analytics-url";

const GA_ID = "G-DW8JY6VMH4";

// The URL this page load started on, redacted; null for a private link.
let landing: string | null | undefined;
function landingLocation(): string | null {
  if (landing === undefined) {
    const url = new URL(window.location.href);
    landing = carriesCredentials(url) ? null : redactUrl(url.href);
  }
  return landing;
}
const subscribeNever = () => () => {};

/** Google Analytics, Meta Pixel and Vercel Analytics, kept away from private links. */
export function SiteAnalytics() {
  // Decided once per page load: a page opened from a private link (an invoice,
  // an invite, a cancel link) loads no third-party trackers at all, even after
  // navigating on, since going Back would then report the private URL.
  const location = useSyncExternalStore(subscribeNever, landingLocation, () => null);

  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />
      {location && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="lazyOnload" />
          <Script id="gtag-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { page_location: ${JSON.stringify(location)} });
            `}
          </Script>
          <MetaPixel />
        </>
      )}
    </>
  );
}
