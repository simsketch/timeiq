import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { HEADLINES } from "@/components/landing/headlines";

// Draft homepage with the scroll-scrubbed clock hero, for comparison with "/".
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function ClockPage() {
  return <LandingPage headline={HEADLINES.default} hero="clock" />;
}
