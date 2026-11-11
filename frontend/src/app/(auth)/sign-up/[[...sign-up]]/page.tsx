import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { ArrowDown, ArrowRight, CalendarDays, Check, Mail, MessageCircle, Paintbrush, ShieldCheck } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { HEADLINES, variantForAd } from "@/components/landing/headlines";
import { SignupOffer } from "@/components/signup-offer";

export const metadata: Metadata = {
  title: "Start free — TimeIQ",
  description: "Chat with your calendar, import schedules by forwarding emails, and share a booking page with your own logo. Free for everyone to try: first 7 meetings free, no card needed.",
  alternates: { canonical: "/sign-up" },
};

const benefits = [
  {
    icon: MessageCircle,
    title: "Chat with your calendar.",
    description: "Ask what’s on tomorrow, find a free slot, or paste a schedule. Your built-in AI chatbot helps you get it done in plain words.",
  },
  {
    icon: CalendarDays,
    title: "Forward it. It’s imported.",
    description: "Forward a schedule email, PDF, or screenshot. TimeIQ automatically extracts the events and adds them to your TimeIQ calendar, with undo if you need it.",
  },
  {
    icon: Paintbrush,
    title: "Your booking page. Your brand.",
    description: "Upload your logo and hide TimeIQ branding. Share a booking link that checks your connected calendars before offering a time.",
  },
  {
    icon: Mail,
    title: "Skip the scheduling back-and-forth.",
    description: "Cc TimeIQ to coordinate a meeting. It gathers availability and finds a time, so you can skip the back-and-forth.",
  },
];

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const signInHref = typeof query.redirect_url === "string" ? `/sign-in?redirect_url=${encodeURIComponent(query.redirect_url)}` : "/sign-in";
  const content = typeof query.utm_content === "string" ? query.utm_content : null;
  const variant = variantForAd(content);
  const headline = variant === "no-upsells" ? {
    lead: "Simple scheduling.",
    accent: "One clear price.",
  } : variant ? HEADLINES[variant] : {
    lead: "Your calendar.",
    accent: "Your AI assistant.",
  };

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#20201e]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b84705]" aria-label="TimeIQ home">
          <LogoIcon className="h-11 w-11" />
          <span className="text-[23px] font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <Link href={signInHref} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-[#494943] transition hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b84705]">
          Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-12 pt-5 sm:px-8 sm:pt-9 lg:px-12 lg:pt-12">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 xl:gap-24">
          <section aria-labelledby="signup-heading" className="min-w-0 lg:pt-3">
            <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#785138] sm:mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d35109]" aria-hidden="true" />
              AI scheduling. Your calendar. Your brand.
            </p>
            <h1 id="signup-heading" className="max-w-[12ch] font-serif text-[clamp(2.8rem,5.2vw,4.8rem)] leading-[1.02] tracking-[-0.035em] text-balance">
              {headline.lead}{" "}
              <em className="text-[#b84705]">{headline.accent}</em>
            </h1>
            <p className="mt-5 max-w-[34rem] text-[16px] leading-relaxed text-[#595950] sm:text-lg">
              A chatbot that knows your schedule. Automatic imports from forwarded emails.
              A booking page with your own logo. All in one place.
            </p>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[#33332f]">
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#b84705]" aria-hidden="true" />Free for everyone to try</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#b84705]" aria-hidden="true" />No credit card</span>
            </p>
            <p className="mt-2 text-xs text-[#69695f]">Your first 7 meetings are free, with every feature included.</p>
            <a href="#create-account" className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d8d3c8] bg-white/70 px-4 py-2.5 text-sm font-semibold lg:hidden">
              Create your free account <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>

            <div className="mt-8 hidden gap-x-7 gap-y-6 border-t border-[#dedacf] pt-7 lg:grid lg:grid-cols-2">
              {benefits.map(({ icon: Icon, title, description }) => (
                <div key={title}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e2d8ca] bg-[#f0e7dc] text-[#98410d]">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </div>
                  <div className="mt-3">
                    <h2 className="text-[15px] font-semibold">{title}</h2>
                    <p className="mt-1 max-w-lg text-sm leading-relaxed text-[#65655b]">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="create-account" aria-labelledby="create-account-heading" className="min-w-0 scroll-mt-5 rounded-[1.6rem] border border-[#e4dfd4] bg-white p-5 shadow-[0_20px_60px_-35px_rgba(49,37,18,0.35)] sm:p-8">
            <div className="mb-5 border-b border-[#eeece6] pb-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a34410]">Try every feature free</p>
              <h2 id="create-account-heading" className="text-xl font-semibold tracking-tight">Your time back starts here.</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#69695f]">Create an account, then connect your calendars. You choose what to connect.</p>
            </div>
            <SignUp appearance={{ elements: {
              rootBox: { width: "100%" },
              cardBox: { width: "100%", maxWidth: "none", boxShadow: "none" },
              card: { width: "100%", border: "none", background: "transparent", padding: 0, boxShadow: "none" },
              footer: { background: "transparent" },
            } }} />
            <div className="mt-5 border-t border-[#eeece6] pt-5">
              <SignupOffer />
            </div>
          </section>
        </div>

        <section aria-label="What you can do with TimeIQ" className="mt-10 grid gap-5 lg:hidden">
          {benefits.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-3.5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#98410d]" aria-hidden="true" />
              <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-[#65655b]">{description}</p></div>
            </div>
          ))}
        </section>

        <section aria-labelledby="next-steps-heading" className="mt-12 rounded-2xl border border-[#e4dfd4] bg-[#eeebe3] px-6 py-7 sm:mt-16 sm:px-8">
          <h2 id="next-steps-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6c6559]">A simpler week starts with three steps</h2>
          <ol className="mt-5 grid gap-5 text-sm sm:grid-cols-3 sm:gap-8">
            {[
              ["01", "Connect your calendars", "Bring your work and personal plans into one view."],
              ["02", "Make it work for you", "Ask the chatbot, forward a schedule, or add your logo to your booking page."],
              ["03", "Get on with your day", "See your schedule and let people book around the time you’re already using."],
            ].map(([number, title, description]) => (
              <li key={number} className="flex gap-3"><span className="pt-0.5 font-mono text-xs text-[#9a5b32]">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 leading-relaxed text-[#65655b]">{description}</p></div></li>
            ))}
          </ol>
        </section>

        <footer className="mt-8 flex flex-col justify-between gap-4 text-xs text-[#69695f] sm:flex-row sm:items-center">
          <p className="inline-flex items-start gap-2 leading-relaxed"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />Google Calendar access is read-only. Disconnect whenever you like.</p>
          <nav aria-label="Signup information" className="flex gap-5">
            <Link href="/pricing" className="underline-offset-4 hover:underline">Pricing</Link>
            <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
            <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
