import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoIcon } from "@/components/logo";

export const metadata = {
  title: "Terms of Service - TimeIQ",
  description: "The agreement between you and TimeIQ.",
};

const UPDATED = "September 10, 2026";
const CONTACT = "simsketch@gmail.com";

export default function TermsPage() {
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
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Legal</div>
          <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.025em]">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mt-3">Last updated {UPDATED}</p>
        </div>

        <div className="glass rounded-[1.5rem] p-7 sm:p-10 space-y-8 text-[15px] leading-relaxed">
          <Section title="The service">
            TimeIQ, operated by Yoyo Code, provides booking pages, calendar sync, time tracking, and invoicing at timeiq.app. By creating an account you agree to these terms and to the{" "}
            <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
          </Section>

          <Section title="Your account">
            You need to be at least 18 and able to enter a contract. Keep your sign-in secure; you are responsible for activity under your account. Give us accurate details, including on invoices you send through the service.
          </Section>

          <Section title="Subscriptions and billing">
            <ul className="list-disc pl-5 space-y-2">
              <li>TimeIQ is a paid subscription billed yearly in advance through Stripe. The price shown at checkout is the price you pay, and it renews automatically each year at that price until you cancel.</li>
              <li><strong>Founding member price.</strong> The first 100 paying subscribers pay the founder rate for as long as their subscription stays active without lapsing. If it cancels or fails to renew, re-subscribing is at the then-current standard price.</li>
              <li>Cancel anytime from Settings. You keep access until the end of the period you paid for. We do not prorate partial years.</li>
              <li><strong>Refunds.</strong> If TimeIQ is not for you, email us within 30 days of your first payment and we will refund it in full.</li>
              <li>We may change prices for future renewals with at least 30 days' notice by email. Founder pricing is exempt while it stays active.</li>
            </ul>
          </Section>

          <Section title="Your content">
            You own the bookings, time entries, clients, and invoices you create. You give us permission to store and process them to run the service. You are responsible for the accuracy of invoices you issue and for complying with tax and invoicing rules that apply to you. TimeIQ generates documents; it does not provide accounting, tax, or legal advice.
          </Section>

          <Section title="Acceptable use">
            Do not use TimeIQ to send spam, to invoice for goods or services you did not provide, to infringe anyone's rights, or to attempt to breach or overload the service. We can suspend accounts that do.
          </Section>

          <Section title="Third-party services">
            Sign-in (Clerk), payments (Stripe), email (Resend), and calendar sync (Google) are provided by third parties under their own terms. Outages or changes on their side can affect TimeIQ, and we will do our best to work around them.
          </Section>

          <Section title="Availability and changes">
            We aim to keep TimeIQ running and improving, but it is provided as is, without warranty of uninterrupted or error-free operation. We may add, change, or remove features. If we ever shut the service down, we will give at least 30 days' notice and a way to export your data.
          </Section>

          <Section title="Liability">
            To the fullest extent the law allows, Yoyo Code's total liability for any claim relating to TimeIQ is limited to the amount you paid us in the 12 months before the claim. We are not liable for indirect or consequential losses, including lost revenue from a missed booking or an unpaid invoice.
          </Section>

          <Section title="Ending the agreement">
            You can delete your account at any time. We can terminate accounts that violate these terms. Sections on your content, liability, and governing law survive termination.
          </Section>

          <Section title="Governing law">
            These terms are governed by the laws of the State of Florida, United States, without regard to conflict-of-law rules. Disputes will be resolved in the courts located there.
          </Section>

          <Section title="Contact">
            <a className="underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a>
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
