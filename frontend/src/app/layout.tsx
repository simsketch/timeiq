import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toaster";
import { SiteAnalytics } from "@/components/site-analytics";
import "./globals.css";

const SITE = "https://timeiq.app";
const DESCRIPTION =
  "Forward TimeIQ a soccer PDF, band email or team-app screenshot and every event lands on your calendar. One booking link for all your calendars, and your open times in any time zone. Free for 7 days, then $19/year founder price for the first 100 subscribers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "TimeIQ - Forward any schedule. It's on your calendar.",
  description: DESCRIPTION,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "TimeIQ",
    title: "TimeIQ - Forward any schedule. It's on your calendar.",
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "TimeIQ: all your calendars, one booking link",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TimeIQ - Forward any schedule. It's on your calendar.",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* next/font used to preload these; self-hosting means doing it here. */}
        <link
          rel="preload"
          href="/fonts/PlusJakartaSans-normal-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/PlusJakartaSans-italic-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        <SiteAnalytics />
      </body>
    </html>
  );
}
