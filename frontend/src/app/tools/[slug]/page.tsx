import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell, PageIntro, TimeIQCta } from "@/components/marketing-shell";
import { TOOLS, toolBySlug } from "@/components/tools/registry";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tool = toolBySlug((await params).slug);
  if (!tool) return {};
  const url = `https://timeiq.app/tools/${tool.slug}`;
  return {
    title: `${tool.title} | TimeIQ`,
    description: tool.description,
    alternates: { canonical: url },
    openGraph: { title: tool.title, description: tool.description, url, images: ["/og.png"] },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const tool = toolBySlug((await params).slug);
  if (!tool) notFound();
  const others = TOOLS.filter((t) => t.slug !== tool.slug);
  const { Calculator } = tool;
  return (
    <MarketingShell>
      <div className="container mx-auto px-6 pb-20 pt-8 lg:px-10">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">← All free tools</Link>
        <div className="mt-6">
          <PageIntro eyebrow="Free calculator" title={tool.title}>{tool.description}</PageIntro>
        </div>
        <div className="max-w-3xl">
          <Calculator />
        </div>
        <article className="article mt-14">{tool.body}</article>
        <div className="mt-16">
          <TimeIQCta heading={tool.cta.heading} body={tool.cta.body} />
        </div>
        <div className="mt-14">
          <h2 className="text-lg font-semibold">More free tools</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {others.map((t) => (
              <Link key={t.slug} href={`/tools/${t.slug}`} className="rounded-full border bg-background/70 px-4 py-1.5 text-sm hover:bg-background">
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
