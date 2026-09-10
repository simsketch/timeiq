import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoIcon } from "@/components/logo";

export const metadata = {
  title: "Privacy Policy - TimeIQ",
  description: "What TimeIQ collects, why, and how to remove it.",
};

const UPDATED = "September 10, 2026";
const CONTACT = "simsketch@gmail.com";

export default function PrivacyPage() {
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
          <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.025em]">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-3">Last updated {UPDATED}</p>
        </div>

        <div className="glass rounded-[1.5rem] p-7 sm:p-10 space-y-8 text-[15px] leading-relaxed">
          <Section title="Who we are">
            TimeIQ is a scheduling, time tracking, and invoicing service at timeiq.app, operated by Yoyo Code.
            This policy explains what we collect, why, and how to get it removed. Questions go to{" "}
            <a className="underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </Section>

          <Section title="What we collect">
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account details.</strong> Your name, email address, and profile image, provided through our sign-in provider, Clerk. If you sign in with Google, we receive the basic profile Google shares.</li>
              <li><strong>Calendar data.</strong> If you connect a calendar, we store event start and end times, and titles where available, so we can show accurate availability and suggest time entries. We never write to your calendar without an action you take.</li>
              <li><strong>Bookings.</strong> When someone books time with you, we store their name, email, and any details they enter in the booking form, and we email both of you a confirmation.</li>
              <li><strong>Time and invoicing data.</strong> Clients, hourly rates, time entries, and invoices you create. Invoices you send are emailed to your client and available at a private link you control.</li>
              <li><strong>Payment.</strong> Subscriptions are processed by Stripe. We store your Stripe customer and subscription identifiers and status. We never see or store your card number.</li>
              <li><strong>Usage.</strong> Standard server logs, and analytics from Google Analytics and, where enabled, the Meta Pixel, used to understand traffic and measure advertising. These may set cookies.</li>
            </ul>
          </Section>

          <Section title="How we use it">
            To run the service you signed up for: showing availability, confirming bookings, building invoices, charging subscriptions, and sending the emails those actions require. We use aggregate analytics to improve the product and to measure whether our advertising works. We do not sell personal data.
          </Section>

          <Section title="Who we share it with">
            Only the providers needed to operate TimeIQ: Clerk (authentication), Stripe (payments), Resend (transactional email), Google (calendar sync and sign-in, when you choose them), Vercel (hosting), Neon (database), Google Analytics and Meta (analytics and advertising measurement). Each processes data under its own terms. We share booking details with the person you booked with, and invoice details with the client you invoice, because that is the point of those features.
          </Section>

          <Section title="Google user data">
            If you connect Google Calendar, TimeIQ requests read access to your calendars to compute availability and, if you use the feature, to suggest time entries. That data is used only to provide those features, is not shared with third parties except as needed to host the service, and is deleted when you disconnect the calendar or delete your account. TimeIQ's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
          </Section>

          <Section title="Retention and deletion">
            We keep your data while your account exists. Delete your account from Settings, or email us, and we remove your account, calendar data, bookings, time entries, and invoices from our database. Stripe retains billing records as required for tax and fraud purposes. Backups expire on a rolling basis.
          </Section>

          <Section title="Cookies">
            We use cookies for sign-in sessions and for the analytics tools above. You can block analytics cookies in your browser and the service will still work.
          </Section>

          <Section title="Your rights">
            You can access, correct, export, or delete your data at any time by using the app or emailing us. If you are in the EU, UK, or California, you have additional rights under local law, and we will honor them on request.
          </Section>

          <Section title="Changes">
            We will post any material changes here and update the date at the top. Continued use after a change means you accept the updated policy.
          </Section>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          See also the <Link href="/terms" className="underline underline-offset-4">Terms of Service</Link>.
        </p>
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
