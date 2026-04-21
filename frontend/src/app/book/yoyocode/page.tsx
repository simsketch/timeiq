"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Clock, MapPin, ArrowRight, Sparkles as SparklesIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { LogoIcon } from "@/components/logo";
import { ClockLoader } from "@/components/ui/clock-loader";
import { YoyoCodeMobileHero } from "@/components/booking/yoyocode-mobile-hero";

interface EventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  location: string | null;
  color: string;
}

interface UserProfile {
  username: string;
  name: string;
  image_url: string | null;
  event_types: EventType[];
}

const YoyoCodePlayground = dynamic(
  () =>
    import("@/components/booking/yoyocode-playground").then(
      (m) => m.YoyoCodePlayground
    ),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <ClockLoader size="lg" label="Loading playground" />
      </div>
    ),
  }
);

function useCanRender3D() {
  const [can, setCan] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (hover: hover)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => setCan(mq.matches && !reduced.matches);
    check();
    mq.addEventListener("change", check);
    reduced.addEventListener("change", check);
    return () => {
      mq.removeEventListener("change", check);
      reduced.removeEventListener("change", check);
    };
  }, []);
  return can;
}

export default function YoyoCodeBookingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const can3D = useCanRender3D();

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiFetch<UserProfile>(`/api/public/yoyocode`);
        setProfile(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  if (loading) {
    return <ClockLoader fullscreen size="lg" label="Entering the playground" />;
  }

  if (error || !profile) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-6">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative glass rounded-[1.5rem] p-10 text-center max-w-md">
          <h1 className="text-3xl font-display mb-3">Not found</h1>
          <p className="text-muted-foreground text-sm">
            This page isn&apos;t ready yet.
          </p>
        </div>
      </div>
    );
  }

  const displayName = profile.name || profile.username;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#faf8ff] via-[#f2f0fb] to-[#eef5fc]">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />

      {/* ======== HERO ======== */}
      <section className="relative min-h-[92vh] lg:h-screen flex flex-col">
        {/* Nav */}
        <div className="relative z-20 px-6 lg:px-10 py-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 group"
            aria-label="TimeIQ home"
          >
            <LogoIcon className="w-7 h-7 transition-transform group-hover:scale-110" />
            <span className="font-display text-sm tracking-[-0.01em] text-foreground/80 group-hover:text-foreground transition-colors">
              TimeIQ
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--aurora-3))] animate-pulse" />
            Live · available now
          </div>
        </div>

        {/* Copy overlay */}
        <div className="relative z-10 px-6 lg:px-10 pt-4 lg:pt-8 pointer-events-none">
          <div className="max-w-2xl pointer-events-auto">
            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-[hsl(var(--aurora-1))] mb-5">
              <SparklesIcon className="h-3 w-3" />
              A Yoyo Code experience
            </div>
            <h1 className="font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.98] tracking-[-0.035em] mb-4 text-pretty">
              Book time with{" "}
              <span
                className="font-display-italic"
                style={{
                  background:
                    "linear-gradient(120deg, hsl(var(--aurora-5)) 0%, hsl(var(--aurora-1)) 50%, hsl(var(--aurora-4)) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {displayName.toLowerCase()}
              </span>
            </h1>
            <p className="text-base lg:text-lg text-muted-foreground max-w-md lg:max-w-lg leading-relaxed text-pretty">
              Pick a meeting type below — or{" "}
              {can3D ? "tap one of the floating cards to dive straight in" : "scroll to see the options"}.
              Real humans, real calendars, zero back-and-forth.
            </p>

            {/* Interaction hints — desktop only */}
            {can3D && (
              <div className="mt-8 flex items-center gap-5 text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/80">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-5 w-5 rounded-md border border-foreground/15 bg-white/60 grid place-items-center text-[9px]">
                    ↗
                  </span>
                  Move to parallax
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-5 w-5 rounded-md border border-foreground/15 bg-white/60 grid place-items-center text-[9px]">
                    ◉
                  </span>
                  Click to book
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Canvas / fallback */}
        <div className="relative flex-1 min-h-[420px] lg:min-h-0">
          {can3D === null ? null : can3D ? (
            <div className="absolute inset-0">
              <YoyoCodePlayground
                eventTypes={profile.event_types}
                onSelect={(event) =>
                  router.push(`/book/yoyocode/${event.slug}`)
                }
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <YoyoCodeMobileHero eventTypes={profile.event_types} />
            </div>
          )}
        </div>

        {/* Scroll cue */}
        <div className="relative z-10 flex flex-col items-center gap-2 pb-8 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/70">
          <span>Scroll to book</span>
          <span className="inline-block h-8 w-[1px] bg-gradient-to-b from-[hsl(var(--aurora-1))] to-transparent" />
        </div>
      </section>

      {/* ======== BOOKING CARDS ======== */}
      <section
        id="book"
        className="relative px-6 lg:px-10 py-20 lg:py-32 max-w-5xl mx-auto"
      >
        <div className="mb-12 lg:mb-16 max-w-2xl">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">
            Choose your lane
          </div>
          <h2 className="font-display text-4xl lg:text-5xl tracking-[-0.025em] leading-[1.02] text-pretty">
            Pick a meeting type.
          </h2>
        </div>

        {profile.event_types.length === 0 ? (
          <div className="glass rounded-[1.5rem] p-14 text-center">
            <p className="text-muted-foreground">
              No event types are available right now.
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-5 ${
              profile.event_types.length === 1
                ? "max-w-lg"
                : "md:grid-cols-2"
            }`}
          >
            {profile.event_types.map((eventType, i) => (
              <Link
                key={eventType.id}
                href={`/book/yoyocode/${eventType.slug}`}
                className="group reveal"
                style={{ animationDelay: `${200 + i * 80}ms` }}
              >
                <div
                  className="relative h-full glass glass-hover rounded-[1.5rem] p-7 overflow-hidden"
                  style={{
                    "--accent": eventType.color,
                  } as React.CSSProperties}
                >
                  <div
                    aria-hidden
                    className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r-full opacity-80 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: eventType.color }}
                  />
                  <div
                    aria-hidden
                    className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-0 group-hover:opacity-60 transition-opacity duration-500 blur-2xl"
                    style={{
                      background: `radial-gradient(closest-side, ${eventType.color}, transparent)`,
                    }}
                  />

                  <div className="relative flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-2xl lg:text-3xl tracking-[-0.015em] leading-[1.1] mb-2">
                        {eventType.name}
                      </h3>
                      <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {eventType.duration_minutes} min
                        </span>
                        {eventType.location && (
                          <span className="inline-flex items-center gap-1.5 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate normal-case tracking-normal font-sans text-[13px]">
                              {eventType.location.startsWith("http")
                                ? eventType.location
                                    .replace(/^https?:\/\//, "")
                                    .split("/")[0]
                                : eventType.location}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-foreground/30 shrink-0 mt-1 transition-all duration-300 group-hover:text-foreground group-hover:translate-x-1" />
                  </div>

                  {eventType.description && (
                    <p className="relative text-sm text-muted-foreground leading-relaxed text-pretty">
                      {eventType.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-20 pt-10 border-t border-foreground/5">
          <LogoIcon className="w-4 h-4" />
          <span className="text-xs text-muted-foreground">
            Powered by{" "}
            <Link
              href="/"
              className="font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              TimeIQ
            </Link>
            , a{" "}
            <a
              href="https://yoyocode.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              Yoyo Code
            </a>{" "}
            creation
          </span>
        </div>
      </section>
    </div>
  );
}
