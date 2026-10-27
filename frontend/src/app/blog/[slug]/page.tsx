import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell, TimeIQCta } from "@/components/marketing-shell";
import { POSTS, postBySlug } from "@/components/blog/posts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = postBySlug((await params).slug);
  if (!post) return {};
  const url = `https://timeiq.app/blog/${post.slug}`;
  return {
    title: `${post.title} | TimeIQ`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: { type: "article", title: post.title, description: post.description, url, publishedTime: post.date, images: ["/og.png"] },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = postBySlug((await params).slug);
  if (!post) notFound();
  const date = new Date(`${post.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "TimeIQ" },
    publisher: { "@type": "Organization", name: "TimeIQ", url: "https://timeiq.app" },
    mainEntityOfPage: `https://timeiq.app/blog/${post.slug}`,
  };
  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="container mx-auto px-6 pb-20 pt-8 lg:px-10">
        <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">← All posts</Link>
        <header className="mt-6 max-w-3xl">
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{date} · {post.minutes} min read</div>
          <h1 className="mt-3 font-display text-4xl leading-[1.08] tracking-[-0.025em] sm:text-5xl text-balance">{post.title}</h1>
          <p className="mt-5 text-lg text-muted-foreground text-pretty">{post.description}</p>
        </header>
        <article className="article mt-10">{post.body}</article>
        <div className="mt-16"><TimeIQCta /></div>
      </div>
    </MarketingShell>
  );
}
