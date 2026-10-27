import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell, PageIntro, TimeIQCta } from "@/components/marketing-shell";
import { TOOLS } from "@/components/tools/registry";

export const metadata: Metadata = {
  title: "Free time, pay and scheduling calculators | TimeIQ",
  description:
    "Free calculators for hourly to salary, freelance rates, meeting costs, time zone overlap and booking capacity. No sign-up needed.",
  alternates: { canonical: "https://timeiq.app/tools" },
};

export default function ToolsPage() {
  return (
    <MarketingShell>
      <div className="container mx-auto px-6 pb-20 pt-8 lg:px-10">
        <PageIntro eyebrow="Free tools" title="Calculators for your time, pay and calendar.">
          Quick answers to the questions that come up when you sell your time: what an hourly rate adds up to, what to
          charge, what a meeting really costs, and when everyone across time zones is free. No sign-up.
        </PageIntro>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link key={t.slug} href={`/tools/${t.slug}`} className="glass glass-hover group flex flex-col rounded-[1.5rem] p-6">
              <h2 className="text-lg font-semibold tracking-tight">{t.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                Open calculator <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
