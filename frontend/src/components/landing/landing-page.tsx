import type { CSSProperties } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { LanguagePicker } from "@/components/language-picker";
import { AppStoreBadge, GooglePlayBadge, StoreBadges } from "@/components/app-store-badge";
import { PublicPricingCards } from "@/components/billing/pricing-card";
import { HeaderAuthLinks } from "@/components/landing/header-auth-links";
import type { Headline } from "@/components/landing/headlines";
import { GitHubIcon, GITHUB_URL } from "@/components/github-icon";
import { LazyDemo } from "@/components/landing/lazy-demo";
import { McpDemo } from "@/components/landing/mcp-demo";
import { McpDemoContent } from "@/components/landing/mcp-demo-content";
import { OctoLoader } from "@/components/landing/octo/octo-loader";
import { HeroScroll } from "@/components/landing/hero-scroll";
import { ClockHero } from "@/components/landing/clock-hero";

export function LandingPage({ headline: source, hero = "clock" }: { headline: Headline; hero?: "panel" | "clock" }) {
  const t = useTranslations("landing");
  const shell = useTranslations("shell");
  const th = useTranslations("headlines");
  // Variant ids stay English for ad tracking; only the words shown are translated.
  const headline = { ...source, lead: th(`${source.id}.lead` as Parameters<typeof th>[0]), accent: th(`${source.id}.accent` as Parameters<typeof th>[0]) };
  return (
    <div className="relative min-h-screen overflow-x-clip">

      {/* Dark text over the clock hero; light text over dark glass after scrolling. */}
      <header className={`landing-nav ${hero === "clock" ? "landing-nav--clock" : ""} sticky top-0 z-50`}>
        <div aria-hidden="true" className="landing-nav-bar absolute inset-x-0 top-0 h-full bg-[#050505]/70 backdrop-blur-xl border-b border-white/[0.06]" />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-10 py-4 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2.5 group">
            <LogoIcon />
            <span className="text-lg sm:text-xl font-semibold tracking-tight text-inherit">
              TimeIQ
            </span>
          </Link>
          <nav className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-6 whitespace-nowrap text-[15px]">
            <a href="#how" className="hover:opacity-70 transition-opacity">
              {t("nav.how")}
            </a>
            <a href="#features" className="hover:opacity-70 transition-opacity">
              {t("nav.features")}
            </a>
            <a href="#pricing" className="hover:opacity-70 transition-opacity">
              {shell("pricing")}
            </a>
            {/* Longer translations need the room at lg; both links are in the footer too. */}
            <Link href="/tools" className="hidden xl:inline hover:opacity-70 transition-opacity">
              {shell("freeTools")}
            </Link>
            <Link href="/blog" className="hidden xl:inline hover:opacity-70 transition-opacity">
              {shell("blog")}
            </Link>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("nav.github")}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:opacity-70 transition-opacity"
            >
              <GitHubIcon className="h-4 w-4" />
            </a>
            <HeaderAuthLinks onDark />
          </div>
        </div>
      </header>

      <main>
        {/* ================================================================
             HERO — copy on black, a silver panel that takes over on scroll
             and assembles the product around its first two cards
             ================================================================ */}
        {hero === "clock" ? (
          <ClockHero headline={headline} />
        ) : (
        <HeroScroll>
          <div className="hs-stage">
            <div className="hs-copy">
              <h1 className="reveal reveal-1 text-[2.6rem] sm:text-6xl xl:text-[4.25rem] font-normal leading-[1.08] tracking-[-0.01em] text-balance text-[#ededed]">
                <span className="block">{headline.lead}</span>
                <span className="block text-[#a3a3a3]">{headline.accent}</span>
              </h1>
              <p className="reveal reveal-2 mt-6 max-w-[27rem] text-[17px] leading-[1.45] text-[#a3a3a3] text-pretty">
                Forward a schedule, cc a thread, or ask Claude or ChatGPT.
                TimeIQ puts it on your calendar and books you when you&apos;re free.
              </p>
              <div className="reveal reveal-3 mt-9 flex flex-wrap justify-center gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 items-center rounded-md bg-white px-6 text-[15px] font-medium text-[#0a0a0a] transition-colors hover:bg-white/85"
                >
                  Start free
                </Link>
                <a
                  href="#try"
                  className="inline-flex h-12 items-center rounded-md border border-white/15 bg-[#111] px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#1c1c1c]"
                >
                  Try the demo
                </a>
              </div>
              <div className="reveal reveal-3 mt-4">
                <StoreBadges placement="hero" />
              </div>
              <p className="reveal reveal-4 mt-5 text-[13px] text-[#737373]">
                First 7 meetings free, no card. Then $19 a year.
              </p>
              <div className="hs-works reveal reveal-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#525252]">Works with</p>
                <ul className="mt-3 flex flex-wrap justify-center gap-x-7 gap-y-2 text-[15px] font-semibold tracking-tight text-[#6b6b6b]">
                  <li>Google Calendar</li>
                  <li>Outlook</li>
                  <li>iCloud</li>
                  <li>Claude</li>
                  <li>ChatGPT</li>
                </ul>
              </div>
            </div>

            <div className="hs-panel" aria-label="TimeIQ at a glance">
              <div aria-hidden className="hs-panel__bg" />

              <div className="hs-caption">
                <p className="text-xl font-medium text-white">Booked while you slept</p>
                <p className="mt-2 text-sm text-white/70">Your link fills the week. Your calendars stay clean.</p>
              </div>

              <div className="hs-bento">
                {/* Column 1: the two cards that start on the panel */}
                <div className="hs-card hs-a">
                  <p className="hs-label"><span className="hs-dot" />Next up</p>
                  <p className="mt-4 text-3xl font-medium text-white">Intro call</p>
                  <p className="mt-1 text-sm text-white/60">Aghil · Tue 9:00 – 9:30 AM</p>
                  <ul className="mt-5 space-y-2.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
                    <li className="flex items-center gap-2 text-white/85"><span className="hs-dot" />Invite sent</li>
                    <li className="flex items-center gap-2 text-white/85"><span className="hs-dot" />Google Meet link</li>
                    <li className="flex items-center gap-2 text-white/30"><span className="hs-dot hs-dot--dim" />Reminder 1h before</li>
                  </ul>
                </div>
                <div className="hs-card hs-b">
                  <p className="hs-label">This week</p>
                  <p className="mt-3 text-3xl font-medium text-white">12 meetings <span className="align-middle text-xs text-white/60">▲ 3</span></p>
                  <svg viewBox="0 0 220 60" className="mt-4 h-14 w-full" aria-hidden>
                    <path d="M0 48 C 25 44, 35 30, 60 34 S 95 50, 120 36 S 160 14, 185 20 S 210 10, 220 8" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" />
                  </svg>
                </div>

                {/* Columns 2 and 3: assemble on scroll */}
                <div className="hs-card hs-late">
                  <p className="hs-label">Your calendars</p>
                  <div className="mt-4 flex items-baseline gap-8">
                    <p><span className="text-3xl font-medium text-white">4</span><span className="block text-xs text-white/55">connected</span></p>
                    <p><span className="text-3xl font-medium text-white">0</span><span className="block text-xs text-white/55">clashes</span></p>
                  </div>
                  <div className="mt-4 flex h-6 gap-1">
                    <span className="w-[46%] bg-white" />
                    <span className="w-[26%] bg-white/45" />
                    <span className="w-[16%] bg-white/25" />
                    <span className="w-[12%] bg-white/12" />
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Last synced 2 min ago</p>
                </div>
                <div className="hs-card hs-late hidden sm:block">
                  <p className="hs-label">Forwarded</p>
                  <p className="mt-4 inline-block rounded bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/80">9 events added</p>
                  <p className="mt-3 text-sm font-medium text-white">Fw: U10 fall soccer schedule</p>
                  <p className="mt-3 text-xs leading-relaxed text-white/45">Practice Tue &amp; Thu 5:30 PM<br />Games Sat 9:00 AM</p>
                </div>
                <div className="hs-card hs-late">
                  <p className="hs-label">Ask your AI</p>
                  <p className="mt-4 rounded-md bg-white/[0.06] px-3 py-2 font-mono text-xs text-white/70">book 30 min with Aghil Tuesday</p>
                  <p className="mt-3 text-sm text-white">Booked Tue 9:00 AM. Invite sent.</p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Claude · ChatGPT · Cursor</p>
                </div>
                <div className="hs-card hs-late hidden sm:block">
                  <p className="hs-label">Free hours</p>
                  <div className="mt-4 flex h-28 items-end justify-between gap-2">
                    {[["Mon", 3], ["Tue", 5], ["Wed", 2], ["Thu", 6], ["Fri", 4]].map(([d, h]) => (
                      <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="text-xs text-white/70">{h}h</span>
                        <span
                          className={`w-full rounded-sm ${h === 6 ? "bg-white" : "bg-white/20"}`}
                          style={{ height: `${Number(h) * 12}px` }}
                        />
                        <span className="text-[10px] text-white/45">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="hs-tagline">
                <span className="hs-word" style={{ "--i": 0 } as CSSProperties}>Every </span><span className="hs-word" style={{ "--i": 1 } as CSSProperties}>calendar, </span><span className="hs-word" style={{ "--i": 2 } as CSSProperties}>every </span><span className="hs-word" style={{ "--i": 3 } as CSSProperties}>invite, </span><span className="hs-word" style={{ "--i": 4 } as CSSProperties}>one </span><span className="hs-word" style={{ "--i": 5 } as CSSProperties}>booking </span><span className="hs-word" style={{ "--i": 6 } as CSSProperties}>link. </span>
              </p>
            </div>
          </div>
        </HeroScroll>
        )}

        {/* ================================================================
             PRICING CTA — right after the day plays out, before the deep dives
             ================================================================ */}
        <section aria-labelledby="day-cta" className="bg-[hsl(var(--brand-ink))] text-white">
          <div className="container mx-auto flex flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-20">
            <div className="max-w-xl">
              <h2 id="day-cta" className="font-serif text-4xl font-normal leading-[1.05] tracking-[-0.01em] text-balance lg:text-6xl">
                {t("clock.cta.title")}
              </h2>
              <p className="mt-4 text-lg text-white/70 text-pretty">{t("clock.cta.body")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Full page load: sign-up runs Clerk, which this page skips. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
              <a href="/sign-up" className="inline-flex h-12 items-center rounded-md bg-white px-6 text-[15px] font-medium text-[hsl(var(--brand-ink))] transition-colors hover:bg-white/85">
                {t("clock.cta.start")}
              </a>
              <a href="#pricing" className="inline-flex h-12 items-center rounded-md border border-white/25 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10">
                {t("clock.cta.plans")}
              </a>
            </div>
          </div>
        </section>

        {/* ================================================================
             LIVE DEMO — email a schedule
             ================================================================ */}
        <section id="try" className="relative py-24 lg:py-32 scroll-mt-16">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-6">
                <div className="text-sm font-medium text-[#b34409] mb-5">
                  {t("forward.eyebrow")}
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>{t("forward.title")}</span>{" "}
                  <em className="text-[hsl(var(--brand))]">{t("forward.accent")}</em>
                </h2>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                  {t("forward.body")}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <span>
                    {t.rich("forward.builtBy", {
                      link: (chunks) => (
                        <a href="https://yoyocode.com" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-foreground/80">
                          {chunks}
                        </a>
                      ),
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    {t("forward.stripe")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Google Calendar
                  </span>
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <GitHubIcon className="h-3.5 w-3.5" />
                    {t("openSource.eyebrow")}
                  </a>
                </div>
              </div>
              <div className="lg:col-span-6 mx-auto w-full max-w-md lg:max-w-none">
                <div className="relative rounded-[1.75rem] bg-white shadow-[0_30px_80px_-30px_hsl(0_0%_10%/0.35)] ring-1 ring-black/5">
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
                <div className="text-sm font-medium text-[hsl(24_95%_62%)] mb-5">
                  {t("assistants.eyebrow")}
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>{t("assistants.title")}</span>{" "}
                  <em className="text-[hsl(24_95%_62%)]">{t("assistants.accent")}</em>
                </h2>
                <p className="mt-5 text-lg text-white/70 leading-relaxed text-pretty">
                  {t("assistants.body")}
                </p>
                <ul className="mt-6 space-y-2 text-sm text-white/85">
                  {[t("assistants.point1"), t("assistants.point2"), t("assistants.point3")].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(24_95%_62%)]" />
                      {line}
                    </li>
                  ))}
                </ul>
                <Link href="/mcp" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:text-[hsl(24_95%_62%)]">
                  {t("assistants.howTo")}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </Link>
              </div>
              <div className="lg:col-span-7 rounded-[1.75rem] bg-white text-foreground shadow-[0_40px_120px_-30px_hsl(0_0%_0%/0.7)]">
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
                <div className="text-sm font-medium text-[#b34409] mb-5">
                  {t("cc.eyebrow")}
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>{t("cc.title")}</span>{" "}
                  <em className="text-[hsl(var(--brand))]">{t("cc.accent")}</em>
                </h2>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                  {t("cc.body")}
                </p>
                <ul className="mt-6 space-y-2 text-sm text-foreground/80">
                  {[t("cc.point1"), t("cc.point2"), t("cc.point3")].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--brand))]" />
                      {line}
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
              <div className="text-sm font-medium text-[#b34409] mb-5">
                {t("calendars.eyebrow")}
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>{t("calendars.title")}</span>{" "}
                <em className="text-[hsl(var(--brand))]">{t("calendars.accent")}</em>
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                {t("calendars.body")}
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
                <div className="text-sm font-medium text-[#b34409] mb-5">
                  {t("share.eyebrow")}
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>{t("share.title")}</span>{" "}
                  <em className="text-[hsl(var(--brand))]">{t("share.accent")}</em>
                </h2>
                <p className="mt-5 text-lg text-muted-foreground leading-relaxed text-pretty">
                  {t("share.body")}
                </p>
                <ul className="mt-6 space-y-2 text-sm text-foreground/80">
                  {[t("share.point1"), t("share.point2"), t("share.point3")].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--brand))]" />
                      {line}
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
              <div className="text-sm font-medium text-[#b34409] mb-5">
                {t("nav.how")}
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>{t("how.title")}</span>{" "}
                <em className="text-[hsl(var(--brand))]">{t("how.accent")}</em>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {[
                {
                  step: "01",
                  title: t("how.step1Title"),
                  icon: Link2,
                  color: "var(--aurora-1)",
                  desc: t("how.step1Body"),
                },
                {
                  step: "02",
                  title: t("how.step2Title"),
                  icon: Clock,
                  color: "var(--aurora-2)",
                  desc: t("how.step2Body"),
                },
                {
                  step: "03",
                  title: t("how.step3Title"),
                  icon: CheckCircle2,
                  color: "var(--aurora-4)",
                  desc: t("how.step3Body"),
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
                <div className="text-sm font-medium text-[#b34409] mb-5">
                  {t("nav.features")}
                </div>
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                  <span>{t("features.title")}</span>{" "}
                  <em className="text-[hsl(var(--brand))]">
                    {t("features.accent")}
                  </em>
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-6 auto-rows-[minmax(180px,auto)] gap-5">
              {/* Feature 1, wide */}
              <FeatureCard
                className="col-span-6 lg:col-span-4"
                icon={Calendar}
                color="var(--aurora-1)"
                label={t("features.sync.label")}
                title={t("features.sync.title")}
                description={t("features.sync.body")}
                large
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Globe}
                color="var(--aurora-2)"
                label={t("features.zone.label")}
                title={t("features.zone.title")}
                description={t("features.zone.body")}
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Zap}
                color="var(--aurora-3)"
                label={t("features.instant.label")}
                title={t("features.instant.title")}
                description={t("features.instant.body")}
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Shield}
                color="var(--aurora-5)"
                label={t("features.buffers.label")}
                title={t("features.buffers.title")}
                description={t("features.buffers.body")}
              />
              <FeatureCard
                className="col-span-6 lg:col-span-2"
                icon={Mail}
                color="var(--aurora-4)"
                label={t("features.email.label")}
                title={t("features.email.title")}
                description={t("features.email.body")}
              />
              <FeatureCard
                className="col-span-6"
                icon={Users}
                color="var(--aurora-1)"
                label={t("features.types.label")}
                title={t("features.types.title")}
                description={t("features.types.body")}
                large
              />
            </div>
          </div>
        </section>

        {/* ================================================================
             OPEN SOURCE (plans live only in Pricing, below)
             ================================================================ */}
        <section id="open-source" className="relative py-20 lg:py-28">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="glass rounded-[1.5rem] p-8 lg:p-12 max-w-5xl mx-auto grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-center">
              <div>
                <div className="text-sm font-medium text-[hsl(var(--brand))] mb-4">{t("openSource.eyebrow")}</div>
                <h2 className="font-serif font-normal text-4xl lg:text-5xl leading-[1.05] tracking-[-0.01em] text-balance">
                  <span>{t("openSource.title")}</span>{" "}
                  <em className="text-[hsl(var(--brand))]">{t("openSource.accent")}</em>
                </h2>
                <p className="text-base text-muted-foreground mt-5 text-pretty">
                  {t("openSource.body")}
                </p>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-block mt-7">
                  <Button variant="glass" size="lg">
                    <GitHubIcon className="h-4 w-4" />
                    {t("openSource.viewCode")}
                  </Button>
                </a>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground/80 mb-4">{t("openSource.selfHostIntro")}</div>
                <ul className="space-y-3 text-sm">
                  {(["deploy", "provision", "schedule", "update", "share"] as const).map((key) => t(`openSource.selfHost.${key}`)).map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-muted-foreground">
                      <Server className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/70" />
                      {item}
                    </li>
                  ))}
                </ul>
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
              <div className="text-sm font-medium text-[#b34409] mb-5">
                {shell("pricing")}
              </div>
              <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-balance">
                <span>{t("pricing.title")}</span>{" "}
                <em className="text-[hsl(var(--brand))]">
                  {t("pricing.accent")}
                </em>
              </h2>
              <p className="text-lg text-muted-foreground mt-6 text-pretty">
                {t("pricing.body")}
              </p>
              <p className="text-sm text-muted-foreground mt-3">
                {t.rich("pricing.selfHost", {
                  link: (chunks) => (
                    <a
                      href={GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground/85 underline-offset-4 hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
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
                <h2 className="font-serif font-normal text-5xl lg:text-7xl leading-[1.02] tracking-[-0.01em] text-[hsl(var(--brand-ink))] text-balance">
                  {t("cta.title")}{" "}
                  <em className="text-[hsl(var(--brand-ink))]">{t("cta.accent")}</em>
                </h2>
                <p className="text-lg text-[hsl(var(--brand-ink))] mt-7 mb-10 leading-relaxed text-pretty">
                  {t("cta.body")}
                </p>
                <Link href="/sign-up">
                  <Button size="xl" className="bg-white text-[hsl(var(--brand-ink))] hover:bg-white/90">
                    {shell("startFree")}
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
              {/* One text run, so the flex gap doesn't put a space before the comma. */}
              <span>
              <span className="font-semibold tracking-tight">TimeIQ</span>
              <span className="text-sm text-muted-foreground">
                {t.rich("footer.creation", {
                  link: (chunks) => (
                    <a
                      href="https://yoyocode.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground/80 hover:text-foreground underline-offset-4 hover:underline transition-colors"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </span>
              </span>
              <span className="text-muted-foreground text-sm font-mono tabular-nums">
                · &copy; 2026
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground">
              <AppStoreBadge placement="footer" className="h-10 w-auto" />
              <GooglePlayBadge placement="footer" className="h-10 w-auto" />
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
                {shell("freeTools")}
              </Link>
              <Link href="/blog" className="hover:text-foreground transition-colors">
                {shell("blog")}
              </Link>
              <Link href="/mcp" className="hover:text-foreground transition-colors">
                {shell("assistants")}
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                {shell("privacy")}
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                {shell("terms")}
              </Link>
              <a
                href="tel:+15615039444"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors font-mono tabular-nums"
              >
                <Phone className="h-3.5 w-3.5" />
                561.503.9444
              </a>
              <LanguagePicker />
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
