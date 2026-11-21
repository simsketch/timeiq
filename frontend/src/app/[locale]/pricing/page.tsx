import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LogoIcon } from "@/components/logo";
import { PricingCards } from "@/components/billing/pricing-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing.meta");
  return { title: t("title"), description: t("description") };
}

const FAQ = ["free", "get", "cheap", "after", "cancel"] as const;

export default function PricingPage() {
  const t = useTranslations("pricing");
  const shell = useTranslations("shell");
  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="relative container mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon />
          <span className="text-xl font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("home")}
        </Link>
      </header>
      <main className="relative container mx-auto px-6 lg:px-10 pb-24">
        <div className="text-center max-w-2xl mx-auto pt-10 pb-12">
          <div className="text-sm font-medium text-muted-foreground mb-5">{shell("pricing")}</div>
          <h1 className="text-5xl lg:text-7xl leading-[0.98] tracking-[-0.03em] text-balance">
            <span className="font-display">{t("title")}</span>{" "}
            <span className="font-display text-muted-foreground">{t("accent")}</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-6 text-pretty">
            {t("intro")}
          </p>
        </div>
        <PricingCards />
        <div className="max-w-2xl mx-auto mt-20 grid sm:grid-cols-2 gap-8">
          {FAQ.map((key) => (
            <div key={key}>
              <h3 className="font-semibold mb-1.5">{t(`faq.${key}.q`)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{t(`faq.${key}.a`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-16 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">{shell("privacy")}</Link>
          {" · "}
          <Link href="/terms" className="hover:text-foreground">{shell("terms")}</Link>
        </p>
      </main>
    </div>
  );
}
