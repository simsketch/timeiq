import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CheckCircle2,
  ArrowRight,
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
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  const calendarDays = [
    ...Array(6).fill({ day: "", blank: true }),
    ...Array.from({ length: 28 }, (_, i) => ({
      day: String(i + 1),
      blank: false,
      highlighted: i + 1 === 11,
    })),
    { day: "", blank: true },
  ];

  const timeSlots = ["9:00", "10:00", "11:00", "2:00"];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Global aurora mesh — drifts behind everything */}
      <div className="aurora-bg" aria-hidden />
      <div className="grain" aria-hidden />

      {/* Glass nav */}
      <header className="sticky top-0 z-50">
        <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-white/70 via-white/40 to-transparent backdrop-blur-xl border-b border-white/40" />
        <div className="relative container mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <LogoIcon />
            <span className="text-xl font-semibold tracking-tight">
              TimeIQ
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a
              href="#features"
              className="hover:text-foreground transition-colors"
            >
              Features
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <SignedOut>
              <Link href="/sign-in">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/sign-up">
                <Button variant="default">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>
      </header>

      <main>
        {/* ================================================================
             HERO
             ================================================================ */}
        <section className="relative">
          <div className="container mx-auto px-6 lg:px-10 pt-20 lg:pt-28 pb-24 lg:pb-36">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
              <div className="lg:col-span-7 space-y-8">
                <div className="reveal reveal-1">
                  <span className="inline-flex items-center gap-2 glass rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--aurora-1))] shadow-[0_0_12px_hsl(var(--aurora-1))]" />
                    Smart scheduling, thoughtfully designed
                  </span>
                </div>

                <h1 className="reveal reveal-2 text-[3.25rem] sm:text-6xl lg:text-[5.5rem] leading-[0.95] tracking-[-0.035em] text-balance">
                  <span className="font-display">Schedule meetings</span>
                  <br />
                  <span className="font-display-italic text-aurora">
                    without the chase.
                  </span>
                </h1>

                <p className="reveal reveal-3 text-lg lg:text-xl text-muted-foreground max-w-2xl leading-relaxed text-pretty">
                  Share your availability, let others book time with you
                  instantly, and never play email tag again. TimeIQ makes
                  scheduling feel like a breath of air.
                </p>

                <div className="reveal reveal-4 flex flex-col sm:flex-row gap-3">
                  <Link href="/sign-up">
                    <Button variant="aurora" size="xl">
                      Start for free
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/sign-in">
                    <Button variant="glass" size="xl">
                      Sign in
                    </Button>
                  </Link>
                </div>

                <div className="reveal reveal-5 flex items-center gap-5 pt-2 text-xs text-muted-foreground/80">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--aurora-1))]" />
                    No credit card
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--aurora-1))]" />
                    2-minute setup
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--aurora-1))]" />
                    Free forever plan
                  </span>
                </div>
              </div>

              {/* Floating glass booking card */}
              <div className="lg:col-span-5 hidden lg:block relative reveal reveal-3">
                {/* Ambient aurora halo behind the whole composition */}
                <div className="hero-halo" aria-hidden />

                {/* Ground shadow — lives outside the float so it breathes against the card */}
                <div className="hero-shadow" aria-hidden />

                {/* The float orbit wraps the card + its satellites so they all drift together */}
                <div className="relative hero-float">
                  {/* Stacked back-card gives a second layer of glass depth */}
                  <div className="hero-backcard" aria-hidden />

                  <div className="glass glass-chroma rounded-[1.75rem] p-7 transition-transform duration-700 hover:scale-[1.015]">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-11 w-11 rounded-full bg-[linear-gradient(135deg,hsl(var(--aurora-5)),hsl(var(--aurora-1)))] flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-[hsl(var(--aurora-1))]/25">
                        EZ
                      </div>
                      <div>
                        <div className="font-semibold">Elon Zito</div>
                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                          30 min meeting
                        </div>
                      </div>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-baseline justify-between mb-3">
                        <div className="text-sm font-medium">February 2026</div>
                        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                          EST · UTC−5
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-1 mb-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                          <div key={i} className="text-center">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((item, index) => (
                          <div
                            key={index}
                            className={`aspect-square flex items-center justify-center text-xs rounded-lg font-medium transition-colors ${
                              item.blank
                                ? ""
                                : item.highlighted
                                ? "bg-foreground text-background shadow-[0_4px_14px_-2px_hsl(var(--foreground)/0.35)]"
                                : "text-foreground/80 hover:bg-foreground/[0.06]"
                            }`}
                          >
                            {item.day}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-sm font-medium mb-2.5">
                        Available times
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {timeSlots.map((time, index) => (
                          <button
                            key={index}
                            className={`h-9 rounded-lg text-sm font-mono tabular-nums transition-colors ${
                              index === 0
                                ? "bg-foreground text-background"
                                : "glass text-foreground/80 hover:text-foreground"
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button variant="aurora" className="w-full">
                      Confirm booking
                    </Button>
                  </div>

                  {/* Top-right "Synced" pill — counter-phase drift */}
                  <div className="absolute -top-4 -right-4 hero-float-pill">
                    <div className="glass rounded-full pl-2 pr-3.5 py-1.5 flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--aurora-2))] opacity-60 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--aurora-2))]" />
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-foreground/80">
                        Calendar synced
                      </span>
                    </div>
                  </div>

                  {/* Bottom-left "Booking confirmed" chip — counter-phase drift */}
                  <div className="absolute -bottom-5 -left-6 hero-float-chip">
                    <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-[hsl(var(--aurora-4))] flex items-center justify-center shadow-[0_6px_18px_-4px_hsl(var(--aurora-4)/0.6)]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="text-xs">
                        <div className="font-semibold">Booking confirmed</div>
                        <div className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider">
                          Just now
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-5">
                How it works
              </div>
              <h2 className="text-4xl lg:text-6xl leading-[1.02] tracking-[-0.025em] text-balance">
                <span className="font-display">Three steps to</span>{" "}
                <span className="font-display-italic text-aurora">
                  effortless
                </span>{" "}
                <span className="font-display">scheduling.</span>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {[
                {
                  step: "01",
                  title: "Share your link",
                  icon: Link2,
                  color: "var(--aurora-1)",
                  desc: "Create your personalized booking page and share it with anyone. Set your availability once and you're done.",
                },
                {
                  step: "02",
                  title: "They pick a time",
                  icon: Clock,
                  color: "var(--aurora-2)",
                  desc: "Your guests see real-time availability and choose a slot that works for everyone. No more email ping-pong.",
                },
                {
                  step: "03",
                  title: "You're booked",
                  icon: CheckCircle2,
                  color: "var(--aurora-4)",
                  desc: "Instant confirmation for both parties, auto-added to calendars, ICS attachments included. Simple as that.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="glass glass-hover rounded-[1.5rem] p-8 relative"
                >
                  <div
                    className="font-display text-[4.5rem] leading-none text-transparent bg-clip-text mb-8"
                    style={{
                      backgroundImage: `linear-gradient(135deg, hsl(${item.color}), hsl(${item.color} / 0.3))`,
                    }}
                  >
                    {item.step}
                  </div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: `hsl(${item.color} / 0.12)`,
                      }}
                    >
                      <item.icon
                        className="h-4 w-4"
                        style={{ color: `hsl(${item.color})` }}
                      />
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight">
                      {item.title}
                    </h3>
                  </div>
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
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-5">
                  Features
                </div>
                <h2 className="text-4xl lg:text-6xl leading-[1.02] tracking-[-0.025em] text-balance">
                  <span className="font-display">Everything you need to</span>{" "}
                  <span className="font-display-italic text-aurora">
                    own your time.
                  </span>
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
                title="Seamlessly connected."
                description="Sync with Google Calendar, Outlook, and iCal to prevent double bookings automatically. One source of truth for every meeting."
                large
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Globe}
                color="var(--aurora-2)"
                label="Timezone smart"
                title="Always local."
                description="Automatically detect and display times in your guests' local timezones."
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Zap}
                color="var(--aurora-3)"
                label="Instant"
                title="Zero delay."
                description="Get notified the moment someone books with you."
              />
              <FeatureCard
                className="col-span-6 md:col-span-3 lg:col-span-2"
                icon={Shield}
                color="var(--aurora-5)"
                label="Buffer times"
                title="Breathing room."
                description="Add padding between meetings so you never feel back-to-back."
              />
              <FeatureCard
                className="col-span-6 lg:col-span-2"
                icon={Mail}
                color="var(--aurora-4)"
                label="Email"
                title="In the loop."
                description="Automated confirmations, reminders, and calendar invites for everyone."
              />
              <FeatureCard
                className="col-span-6 lg:col-span-4"
                icon={Users}
                color="var(--aurora-1)"
                label="Event types"
                title="Your meetings, your way."
                description="Create different meeting types with unique durations, buffers, intake fields, and settings — all from one dashboard."
                large
              />
            </div>
          </div>
        </section>

        {/* ================================================================
             CTA — dark glass panel over aurora
             ================================================================ */}
        <section className="py-24 lg:py-36">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="relative overflow-hidden rounded-[2rem] lg:rounded-[2.5rem] aurora-bg-dark p-12 lg:p-20 text-center">
              <div className="grain opacity-20" aria-hidden />
              <div className="relative max-w-3xl mx-auto">
                <h2 className="text-4xl lg:text-6xl leading-[1.02] tracking-[-0.025em] text-white text-balance">
                  <span className="font-display">Ready to take control of</span>{" "}
                  <span className="font-display-italic bg-gradient-to-r from-white via-[hsl(var(--aurora-4))] to-[hsl(var(--aurora-2))] bg-clip-text text-transparent">
                    your time?
                  </span>
                </h2>
                <p className="text-lg text-white/70 mt-7 mb-10 leading-relaxed text-pretty">
                  Join thousands of professionals who save hours every week.
                  Start scheduling smarter today.
                </p>
                <Link href="/sign-up">
                  <Button variant="aurora" size="xl">
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-foreground/5">
        <div className="container mx-auto px-6 lg:px-10 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <LogoIcon className="w-6 h-6" />
              <span className="font-semibold tracking-tight">TimeIQ</span>
              <span className="text-muted-foreground/70 text-sm font-mono tabular-nums">
                · &copy; 2026
              </span>
            </div>
            <a
              href="tel:+15615039444"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-mono tabular-nums"
            >
              <Phone className="h-3.5 w-3.5" />
              561.503.9444
            </a>
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
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.15em] mb-5"
          style={{
            backgroundColor: `hsl(${color} / 0.1)`,
            color: `hsl(${color})`,
          }}
        >
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <h3
          className={`font-display tracking-[-0.02em] leading-[1.05] mb-3 ${
            large ? "text-4xl lg:text-5xl" : "text-2xl lg:text-3xl"
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
