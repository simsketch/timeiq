import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { HEADLINES, HEADLINE_VARIANTS, type HeadlineVariant } from "@/components/landing/headlines";

// Ad visitors reach these through a rewrite of "/", so the address bar keeps "/".
export const dynamicParams = false;

export function generateStaticParams() {
  return HEADLINE_VARIANTS.map((variant) => ({ variant }));
}

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default async function HeadlineVariantPage({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  return <LandingPage headline={HEADLINES[variant as HeadlineVariant]} />;
}
