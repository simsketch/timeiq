import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarketingShell, PageIntro, TimeIQCta } from "@/components/marketing-shell";
import { TOOLS, toolBySlug } from "@/components/tools/registry";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tool = toolBySlug((await params).slug);
  if (!tool) return {};
  const t = await getTranslations(`tools.items.${tool.key}`);
  const url = `https://timeiq.app/tools/${tool.slug}`;
  return {
    title: `${t("title")} | TimeIQ`,
    description: t("description"),
    alternates: { canonical: url },
    openGraph: { title: t("title"), description: t("description"), url, images: ["/og.png"] },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const tool = toolBySlug((await params).slug);
  if (!tool) notFound();
  const t = await getTranslations("tools");
  const others = TOOLS.filter((x) => x.slug !== tool.slug);
  const { Calculator } = tool;
  return (
    <MarketingShell>
      <div className="container mx-auto px-6 pb-20 pt-8 lg:px-10">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">{t("allTools")}</Link>
        <div className="mt-6">
          <PageIntro eyebrow={t("calculatorEyebrow")} title={t(`items.${tool.key}.title`)}>{t(`items.${tool.key}.description`)}</PageIntro>
        </div>
        <div className="max-w-3xl">
          <Calculator />
        </div>
        <article className="article mt-14" lang="en">{tool.body}</article>
        <div className="mt-16">
          <TimeIQCta heading={t(`items.${tool.key}.ctaHeading`)} body={t(`items.${tool.key}.ctaBody`)} />
        </div>
        <div className="mt-14">
          <h2 className="text-lg font-semibold">{t("moreTools")}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {others.map((x) => (
              <Link key={x.slug} href={`/tools/${x.slug}`} className="rounded-full border bg-background/70 px-4 py-1.5 text-sm hover:bg-background">
                {t(`items.${x.key}.name`)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
