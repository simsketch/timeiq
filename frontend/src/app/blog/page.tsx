import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, PageIntro, TimeIQCta } from "@/components/marketing-shell";
import { POSTS } from "@/components/blog/posts";

export const metadata: Metadata = {
  title: "Blog: calendars, scheduling and your time | TimeIQ",
  description: "Practical guides to booking links, calendars, time zones and getting paid for your time.",
  alternates: { canonical: "https://timeiq.app/blog" },
};

const fmt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <MarketingShell>
      <div className="container mx-auto px-6 pb-20 pt-8 lg:px-10">
        <PageIntro eyebrow="Blog" title="Calendars, scheduling and your time.">
          Practical guides for people who book their days: connecting every calendar, sharing availability across time
          zones, and getting paid for the hours.
        </PageIntro>
        <div className="grid max-w-3xl gap-4">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="glass glass-hover rounded-[1.25rem] p-6">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {fmt(p.date)} · {p.minutes} min read
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-balance">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
            </Link>
          ))}
        </div>
        <div className="mt-16"><TimeIQCta /></div>
      </div>
    </MarketingShell>
  );
}
