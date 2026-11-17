import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoIcon } from "@/components/logo";

export const metadata = {
  title: "Support - TimeIQ",
  description: "Get help with TimeIQ on the web, iPhone and Android.",
};

const CONTACT = "hello@timeiq.app";

export default function SupportPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />
      <header className="relative container mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon />
          <span className="text-xl font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
      </header>
      <main className="relative container mx-auto px-6 lg:px-10 pb-24 max-w-3xl">
        <div className="pt-8 pb-10">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Help</div>
          <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.025em]">Support</h1>
        </div>

        <div className="glass rounded-[1.5rem] p-7 sm:p-10 space-y-8 text-[15px] leading-relaxed">
          <Section title="Contact us">
            Email <a className="underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a> with what you
            were doing and what happened. A person reads every message, usually within one business day.
          </Section>
          <Section title="A calendar stopped syncing">
            Open Calendars and tap Reconnect (Google or Outlook) or the link icon (calendar links) to replace the link.
            Events from a broken calendar don&apos;t block your booking page until it syncs again.
          </Section>
          <Section title="An imported schedule looks wrong">
            Every import can be undone from Import, under Recent. Forward the original email to {CONTACT} and we&apos;ll
            look at why it was read that way.
          </Section>
          <Section title="Your data and your account">
            Export everything as CSV files from Settings, under Developers and data. Delete your account from the
            Account screen in the app or from Settings on the web; it removes your data as described in the{" "}
            <Link className="underline underline-offset-4" href="/privacy">Privacy Policy</Link>.
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-lg mb-2">{title}</h2>
      <div className="text-foreground/80 text-pretty">{children}</div>
    </section>
  );
}
