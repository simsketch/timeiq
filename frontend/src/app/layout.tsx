import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/toaster";
import { MetaPixel } from "@/components/meta-pixel";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const SITE = "https://timeiq.app";
const DESCRIPTION =
  "Booking pages, weekly timesheets, and PDF invoices in one calm app. $5/year founder price for the first 100 subscribers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "TimeIQ - Scheduling, timesheets, and invoices",
  description: DESCRIPTION,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "TimeIQ",
    title: "TimeIQ - Book meetings. Log hours. Send invoices.",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TimeIQ: book meetings, log hours, send invoices" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TimeIQ - Book meetings. Log hours. Send invoices.",
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
        className={`${GeistSans.variable} ${GeistMono.variable} ${plusJakarta.variable}`}
      >
        <head>
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-J3Q5ZW2PGP"
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-J3Q5ZW2PGP');
            `}
          </Script>
        </head>
        <body className="font-sans antialiased">
          {children}
          <Toaster />
          <MetaPixel />
        </body>
      </html>
    </ClerkProvider>
  );
}
