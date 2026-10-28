import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Header, footer and background shared by the tools and blog pages. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />
      <header className="relative z-10 container mx-auto flex items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon />
          <span className="text-xl font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-5">
          <Link href="/tools" className="px-2 py-1 text-muted-foreground hover:text-foreground">Free tools</Link>
          <Link href="/blog" className="px-2 py-1 text-muted-foreground hover:text-foreground">Blog</Link>
          <Link href="/mcp" className="hidden px-2 py-1 text-muted-foreground hover:text-foreground lg:inline">AI assistants</Link>
          <Link href="/pricing" className="hidden px-2 py-1 text-muted-foreground hover:text-foreground sm:inline">Pricing</Link>
          <Link href="/billing/checkout" className="hidden sm:inline">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>
      <main className="relative z-10">{children}</main>
      <footer className="relative z-10 border-t border-foreground/5">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-10">
          <span>© 2026 TimeIQ, a Yoyo Code creation</span>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/tools" className="hover:text-foreground">Free tools</Link>
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            <Link href="/mcp" className="hover:text-foreground">AI assistants</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** The TimeIQ pitch at the bottom of every tool and post. */
export function TimeIQCta({ heading, body }: { heading?: string; body?: string }) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] aurora-bg-dark p-8 text-center sm:p-12">
      <div className="relative mx-auto max-w-2xl">
        <h2 className="font-display text-3xl tracking-[-0.02em] text-white sm:text-4xl text-balance">
          {heading ?? "All your calendars. One booking link."}
        </h2>
        <p className="mt-4 text-white/75 text-pretty">
          {body ??
            "TimeIQ merges Google, Outlook and iCloud so people only book when you're really free. Email it a schedule and it adds the events. Share your open times in any time zone in one click."}
        </p>
        <Link href="/billing/checkout" className="mt-7 inline-block">
          <Button variant="aurora" size="lg">
            Try TimeIQ for $19/year + tax
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10 max-w-3xl">
      <div className="mb-4 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</div>
      <h1 className="font-display text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl text-balance">{title}</h1>
      {children && <div className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">{children}</div>}
    </div>
  );
}
