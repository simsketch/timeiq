import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/toaster";
import { MetaPixel } from "@/components/meta-pixel";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const SITE = "https://timeiq.app";
const DESCRIPTION =
  "All your calendars in one booking link. Email TimeIQ a schedule and it adds the events; share your open times in any time zone. $19/year founder price for the first 100 subscribers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "TimeIQ - All your calendars. One booking link.",
  description: DESCRIPTION,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "TimeIQ",
    title: "TimeIQ - All your calendars. One booking link.",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TimeIQ: all your calendars, one booking link" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TimeIQ - All your calendars. One booking link.",
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
    <ClerkProvider>
      <html
        lang="en"
        className={`${GeistSans.variable} ${GeistMono.variable}`}
      >
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
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-DW8JY6VMH4"
            strategy="lazyOnload"
          />
          <Script id="gtag-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-DW8JY6VMH4');
            `}
          </Script>
        </head>
        <body className="font-sans antialiased">
          {children}
          <Toaster />
          <MetaPixel />
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
