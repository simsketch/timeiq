import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MarketingShell, PageIntro, TimeIQCta } from "@/components/marketing-shell";
import { TOOLS } from "@/components/tools/registry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tools");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "https://timeiq.app/tools" },
  };
}

export default async function ToolsPage() {
  const t = await getTranslations("tools");
  return (
    <MarketingShell>
      <div className="container mx-auto px-6 pb-20 pt-8 lg:px-10">
        <PageIntro eyebrow={t("eyebrow")} title={t("title")}>
          {t("intro")}
        </PageIntro>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="glass glass-hover group flex flex-col rounded-[1.5rem] p-6">
              <h2 className="text-lg font-semibold tracking-tight">{t(`items.${tool.key}.name`)}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t(`items.${tool.key}.description`)}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                {t("openCalculator")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-16">
          <TimeIQCta />
        </div>
      </div>
    </MarketingShell>
  );
}
