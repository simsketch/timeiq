import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CheckCircle2,
  ArrowRight,
  Server,
  Link2,
  Calendar,
  Globe,
  Zap,
  Shield,
  Mail,
  Users,
  Phone,
} from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { PublicPricingCards } from "@/components/billing/pricing-card";
import { HeaderAuthLinks } from "@/components/landing/header-auth-links";
import type { Headline } from "@/components/landing/headlines";
import { GitHubIcon, GITHUB_URL } from "@/components/github-icon";
import { LazyDemo } from "@/components/landing/lazy-demo";
import { McpDemo } from "@/components/landing/mcp-demo";
import { McpDemoContent } from "@/components/landing/mcp-demo-content";
import { OctoLoader } from "@/components/landing/octo/octo-loader";
import { HeroVideo } from "@/components/landing/hero-video";

export function LandingPage({ headline }: { headline: Headline }) {
  return (
    <div className="relative min-h-screen overflow-x-clip">

      {/* Nav: transparent over the black hero, a dark glass bar further down */}
      <header className="sticky top-0 z-50">
        <div className="landing-nav-bar absolute inset-x-0 top-0 h-full bg-[#050505]/70 backdrop-blur-xl border-b border-white/[0.06]" />
        <div className="relative container mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <LogoIcon />
            <span className="text-xl font-semibold tracking-tight text-white">
              TimeIQ
            </span>
          </Link>
          <nav className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-6 text-[15px] text-[#b6b5b5]">
            <a href="#how" className="hover:text-white transition-colors">
              How it works
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
            <Link href="/tools" className="hover:text-white transition-colors">
              Free tools
            </Link>
            <Link href="/blog" className="hover:text-white transition-colors">
              Blog
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TimeIQ on GitHub"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[#b6b5b5] hover:text-white transition-colors"
            >
              <GitHubIcon className="h-4 w-4" />
            </a>
            <HeaderAuthLinks onDark />
          </div>
        </div>
      </header>

      <main>
        {/* ================================================================
             HERO — black stage, a door of light, copy on the left
             ================================================================ */}
        <section className="hero-stage relative isolate -mt-[73px] flex min-h-[100svh] flex-col overflow-hidden bg-[#050505] text-[#fafafa]">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="hero-door absolute inset-0" />
            <HeroVideo />
            <div className="hero-stage__fade absolute inset-0" />
          </div>

          <div className="container mx-auto flex flex-1 flex-col justify-center px-6 lg:px-10 pt-[calc(73px+3rem)] pb-16">
            <h1 className="reveal reveal-1 max-w-[16ch] text-[2.75rem] sm:text-6xl xl:text-[4.5rem] font-normal leading-[1.1] tracking-[0.004em] text-balance">
              <span className="block">{headline.lead}</span>
              <span className="block">{headline.accent}</span>
            </h1>

            <p className="reveal reveal-2 mt-7 max-w-[30rem] text-lg leading-[1.4] text-[#a7a6a6] text-pretty">
              Forward a schedule, cc a thread, or ask Claude or ChatGPT.
              TimeIQ puts it on your calendar and books you when you&apos;re free.
            </p>

            <div className="reveal reveal-3 mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                href="/sign-up"
                className="inline-flex h-[50px] items-center rounded-full bg-white px-8 text-[17px] font-medium text-[#050505] transition-colors hover:bg-white/85"
              >
                Start free
              </Link>
              <a href="#try" className="text-[17px] font-medium text-white transition-opacity hover:opacity-75">
                Try the demo
              </a>
            </div>

            <p className="reveal reveal-4 mt-6 text-sm text-[#8b8a8a]">
              Your first 7 meetings are free, no card needed. Then $19 a year.
            </p>
          </div>

          {/* Works-with strip, sitting in the bottom fade */}
          <div className="reveal reveal-5 container mx-auto px-6 lg:px-10 pb-10">
            <p className="sr-only">Works with</p>
            <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[15px] font-semibold tracking-tight text-[#8b8a8a]">
              <li>Google Calendar</li>
              <li>Outlook</li>
              <li>iCloud</li>
              <li>Claude</li>
              <li>ChatGPT</li>
            </ul>
          </div>
        </section>

        {/* ================================================================
             LIVE DEMO — email a schedule
             ================================================================ */}
        <section id="try" className="relative py-24 lg:py-32 scroll-mt-16">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-6">
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                  Forward it
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>Send the schedule.</span>{" "}
                  <em className="text-[hsl(var(--brand))]">It&apos;s on your calendar.</em>
                </h2>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                  Pick a sample and hit Send. TimeIQ reads PDFs, screenshots and
                  plain email, puts every practice and game on your week, and
                  tells you what clashes.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <span>
                    Built by{" "}
                    <a href="https://yoyocode.com" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-foreground/80">
                      Yoyo Code
                    </a>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    Stripe checkout
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Google Calendar
                  </span>
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <GitHubIcon className="h-3.5 w-3.5" />
                    Open source
                  </a>
                </div>
              </div>
              <div className="lg:col-span-6 mx-auto w-full max-w-md lg:max-w-none">
                <div className="relative rounded-[1.75rem] bg-white shadow-[0_30px_80px_-30px_hsl(260_60%_40%/0.35)] ring-1 ring-black/5">
                  <LazyDemo name="email" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
             LIVE DEMO — TimeIQ inside AI assistants
             ================================================================ */}
        <section id="assistants" className="relative py-24 lg:py-32 scroll-mt-16 bg-[hsl(var(--brand-ink))] text-white">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-5">
                <div className="text-sm font-medium text-[hsl(260_100%_82%)] mb-5">
                  Claude, ChatGPT and Cursor
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>Ask your AI.</span>{" "}
                  <em className="text-[hsl(260_100%_82%)]">It knows your calendar.</em>
                </h2>
                <p className="mt-5 text-lg text-white/70 leading-relaxed text-pretty">
                  Connect TimeIQ to Claude, ChatGPT or Cursor and ask in plain words. It checks every calendar you
                  use before it answers, finds a time with other people and adds schedules for you. Anything
                  that emails someone waits for your OK.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-white/85">
                  {[
                    "Paste one link and click Allow, no setup",
                    "Sees your availability across every calendar",
                    "Disconnect anytime from Settings",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(260_100%_82%)]" />
                      {t}
                    </li>
                  ))}
                </ul>
                <Link href="/mcp" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:text-[hsl(260_100%_82%)]">
                  How to connect your assistant
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </Link>
              </div>
              <div className="lg:col-span-7 rounded-[1.75rem] bg-white text-foreground shadow-[0_40px_120px_-30px_hsl(260_97%_30%/0.7)]">
                <McpDemo fallback={<McpDemoContent />} />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
             LIVE DEMO — cc TimeIQ
             ================================================================ */}
        <section id="cc" className="relative py-24 lg:py-32 scroll-mt-16">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-5">
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                  Cc TimeIQ
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>Cc TimeIQ.</span>{" "}
                  <em className="text-[hsl(var(--brand))]">It finds the time.</em>
                </h2>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                  Cc agent@timeiq.app from your own email on any thread about meeting up. It replies to everyone with three times you&apos;re
                  free, reads their answers in plain English, and books it when you say so. When a recruiter&apos;s or
                  client&apos;s assistant offers times, it picks one you&apos;re free for and holds it.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-foreground/80">
                  {[
                    "Three suggestions, not a wall of slots, plus “pick a different time”",
                    "Replies like “Tuesday after 2 works” just work",
                    "Checks every calendar first, so it never double-books you",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--brand))]" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:col-span-7">
                <LazyDemo name="cc" />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
             LIVE DEMO — all your calendars
             ================================================================ */}
        <section id="calendars" className="relative py-24 lg:py-32 scroll-mt-16">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="max-w-2xl mb-12">
              <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                Every calendar you use
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>All your calendars.</span>{" "}
                <em className="text-[hsl(var(--brand))]">One booking link.</em>
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                A booking page only protects the calendars it can see. TimeIQ checks work, personal, family and
                every schedule you email in, and re-checks right before anyone books. Switch calendars on below and
                watch the clashes disappear.
              </p>
            </div>
            <LazyDemo name="merge" />
          </div>
        </section>

        {/* ================================================================
             LIVE DEMO — share availability
             ================================================================ */}
        <section id="share" className="relative py-24 lg:py-32 scroll-mt-16">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-5">
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                  Share availability
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>&ldquo;When are you free?&rdquo;</span>{" "}
                  <em className="text-[hsl(var(--brand))]">One click.</em>
                </h2>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                  TimeIQ turns every connected calendar into your open times for the week ahead. Add the other
                  person&apos;s time zone and each slot shows both, like EST and PST. Copy it as text for an email or
                  as a picture for a group chat, with your booking link at the bottom.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-foreground/80">
                  {[
                    "Your time zone first, up to two more beside it",
                    "Skips meetings, buffers and anything you emailed in",
                    "Text or picture, ready to paste",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--brand))]" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:col-span-7">
                <LazyDemo name="share" />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
             HOW IT WORKS
             ================================================================ */}
        <section id="how" className="relative py-24 lg:py-36">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="max-w-2xl mb-20">
              <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                How it works
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>Share one link.</span>{" "}
                <em className="text-[hsl(var(--brand))]">TimeIQ does the rest.</em>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {[
                {
                  step: "01",
                  title: "Share your link",
                  icon: Link2,
                  color: "var(--aurora-1)",
                  desc: "Set your hours once and send your page to anyone, or paste your open times into a chat.",
                },
                {
                  step: "02",
                  title: "They pick a time",
                  icon: Clock,
                  color: "var(--aurora-2)",
                  desc: "Guests see only the times every one of your calendars says you're free, in their own time zone.",
                },
                {
                  step: "03",
                  title: "You're booked",
                  icon: CheckCircle2,
                  color: "var(--aurora-4)",
                  desc: "Both of you get the invite and a calendar event, and a push lands on your phone.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="glass glass-hover rounded-[1.5rem] p-8 relative"
                >
                  <div className="font-serif italic text-5xl text-[hsl(var(--brand))] mb-8">{i + 1}</div>
                  <h3 className="text-lg font-semibold tracking-tight mb-2">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-[15px] text-pretty">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================
             FEATURES — editorial asymmetric grid
             ================================================================ */}
        <section id="features" className="relative py-24 lg:py-36">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-16 gap-6">
              <div className="max-w-2xl">
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                  Features
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>Built for a full calendar.</span>{" "}
                  <em className="text-[hsl(var(--brand))]">
                    Work, kids, clients.
                  </em>
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-6 auto-rows-[minmax(180px,auto)] gap-5">
              {/* Feature 1 — wide */}
              <FeatureCard
                className="col-span-6 lg:col-span-4"
                icon={Calendar}
                color="var(--aurora-1)"
                label="Calendar sync"
                title="Every calendar, one view."
                description="Google, Outlook, iCloud and any calendar link, merged into one view. Synced hourly and re-checked before every booking, so nobody books over your other life."
                large
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Globe}
                color="var(--aurora-2)"
                label="Timezone smart"
                title="Their time zone, automatically."
                description="Guests see every open time in their own zone, and so do you."
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Zap}
                color="var(--aurora-3)"
                label="Instant"
                title="A ping when someone books."
                description="An email and a push to your phone the moment a time is taken."
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Shield}
                color="var(--aurora-5)"
                label="Buffer times"
                title="Buffers between meetings."
                description="Padding before and after, so the day never runs back-to-back."
              />
              <FeatureCard
                className="col-span-6 lg:col-span-2"
                icon={Mail}
                color="var(--aurora-4)"
                label="Email"
                title="Invites that keep up."
                description="Confirmations, reminders and calendar invites for everyone, updated when a meeting moves."
              />
              <FeatureCard
                className="col-span-6"
                icon={Users}
                color="var(--aurora-1)"
                label="Event types"
                title="A page for each kind of meeting."
                description="Intro calls, office hours, paid sessions: each gets its own length, buffers, questions and price."
                large
              />
            </div>
          </div>
        </section>

        {/* ================================================================
             OPEN SOURCE + HOSTED
             ================================================================ */}
        <section id="open-source" className="relative py-24 lg:py-36">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                Open source
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>Every line is public.</span>{" "}
                <em className="text-[hsl(var(--brand))]">
                  We run it for you.
                </em>
              </h2>
              <p className="text-lg text-muted-foreground mt-6 text-pretty">
                TimeIQ is open source under the AGPL&#8209;3.0. Read the code, check
                how your calendars and email are handled, or run your own
                copy. Or let us host it for $19 a year and get back to work.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
              <div className="glass rounded-[1.5rem] p-8 flex flex-col">
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">Self-hosted</div>
                <h3 className="font-serif text-4xl tracking-[-0.01em] leading-[1.05] mb-2">
                  Free, on your servers.
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  Clone the repo and deploy the Next.js frontend and FastAPI
                  backend wherever you like.
                </p>
                <ul className="space-y-3 text-sm mb-8">
                  {[
                    "You provision Postgres, Clerk auth and Resend email",
                    "You schedule the calendar sync and reminder jobs",
                    "You apply updates, migrations and security patches",
                    "Changes you serve to others stay open under the AGPL",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-muted-foreground">
                      <Server className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/70" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="mt-auto">
                  <Button variant="glass" size="lg" className="w-full">
                    <GitHubIcon className="h-4 w-4" />
                    View the code on GitHub
                  </Button>
                </a>
              </div>

              <div className="glass rounded-[1.5rem] p-8 flex flex-col">
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">Hosted at timeiq.app</div>
                <h3 className="font-serif text-4xl tracking-[-0.01em] leading-[1.05] mb-2">
                  $19 a year plus tax. Nothing to run.
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  The same code, kept running, updated and backed up by the
                  people who build it.
                </p>
                <ul className="space-y-3 text-sm mb-8">
                  {[
                    "Live in two minutes, with your booking link ready to share",
                    "Calendars synced every hour and before every booking",
                    "Booking email delivered from our domain",
                    "Updates and security fixes the day they ship",
                    "Supports the open source project you are using",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--brand))]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up" className="mt-auto">
                  <Button variant="brand" size="lg" className="w-full">
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
             PRICING
             ================================================================ */}
        <section id="pricing" className="relative py-24 lg:py-36">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <div className="text-sm font-medium text-[hsl(var(--brand))] mb-5">
                Pricing
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>Free to start.</span>{" "}
                <em className="text-[hsl(var(--brand))]">
                  Stupid cheap after.
                </em>
              </h2>
              <p className="text-lg text-muted-foreground mt-6 text-pretty">
                Your first 7 meetings are free. After that, the first 100
                subscribers lock in $19 a year for life, and everyone after pays $29.
              </p>
              <p className="text-sm text-muted-foreground mt-3">
                Prefer to run it yourself?{" "}
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground/85 underline-offset-4 hover:underline"
                >
                  The code is on GitHub
                </a>
                .
              </p>
            </div>
            <PublicPricingCards headline={headline.id} />
          </div>
        </section>

        {/* ================================================================
             CTA
             ================================================================ */}
        <section className="py-24 lg:py-36">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="rounded-[2rem] lg:rounded-[2.5rem] bg-[hsl(var(--brand))] p-12 lg:p-20 text-center">
              <div className="max-w-3xl mx-auto">
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-white text-balance">
                  Try vibe scheduling.{" "}
                  <em className="text-white/75">The first 7 meetings are on us.</em>
                </h2>
                <p className="text-lg text-white/80 mt-7 mb-10 leading-relaxed text-pretty">
                  Connect your calendars, share your link and forward the next
                  schedule that lands in your inbox. No card needed to start.
                </p>
                <Link href="/sign-up">
                  <Button size="xl" className="bg-white text-[hsl(var(--brand-ink))] hover:bg-white/90">
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-foreground/5">
        {/* Tiq's swim lane: reserved space so his late arrival shifts nothing. */}
        <div
          id="tiq-lane"
          aria-hidden
          className="relative h-28 md:h-40 bg-gradient-to-b from-transparent via-[hsl(220_85%_60%/0.07)] to-transparent"
        />
        <OctoLoader />
        <div className="container mx-auto px-6 lg:px-10 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center sm:justify-start sm:text-left">
              <LogoIcon className="w-6 h-6" />
              <span className="font-semibold tracking-tight">TimeIQ</span>
              <span className="text-sm text-muted-foreground">
                , another{" "}
                <a
                  href="https://yoyocode.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground/80 hover:text-foreground underline-offset-4 hover:underline transition-colors"
                >
                  Yoyo Code
                </a>{" "}
                creation
              </span>
              <span className="text-muted-foreground/70 text-sm font-mono tabular-nums">
                · &copy; 2026
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <GitHubIcon className="h-3.5 w-3.5" />
                AGPL-3.0
              </a>
              <Link href="/tools" className="hover:text-foreground transition-colors">
                Free tools
              </Link>
              <Link href="/blog" className="hover:text-foreground transition-colors">
                Blog
              </Link>
              <Link href="/mcp" className="hover:text-foreground transition-colors">
                AI assistants
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <a
                href="tel:+15615039444"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors font-mono tabular-nums"
              >
                <Phone className="h-3.5 w-3.5" />
                561.503.9444
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  color,
  label,
  title,
  description,
  className,
  large,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  title: string;
  description: string;
  className?: string;
  large?: boolean;
}) {
  return (
    <div
      className={`glass glass-hover rounded-[1.5rem] p-7 flex flex-col justify-between gap-6 ${className || ""}`}
    >
      <div>
        <Icon className="h-5 w-5 text-[hsl(var(--brand))] mb-6" aria-label={label} />
        <h3
          className={`font-serif tracking-[-0.01em] leading-[1.05] mb-3 ${
            large ? "text-5xl lg:text-6xl" : "text-3xl lg:text-4xl"
          }`}
        >
          {title}
        </h3>
        <p
          className={`text-muted-foreground leading-relaxed text-pretty ${
            large ? "text-[15px] lg:text-base max-w-xl" : "text-sm"
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
