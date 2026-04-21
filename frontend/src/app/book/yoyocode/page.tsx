"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, MapPin, ArrowRight, Sparkles as SparklesIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { LogoIcon } from "@/components/logo";
import { ClockLoader } from "@/components/ui/clock-loader";
import { YoyoCodePlayground } from "@/components/booking/yoyocode-playground";
import { YoyoCodeDreamscape } from "@/components/booking/yoyocode-dreamscape";

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

export default function YoyoCodeBookingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiFetch<UserProfile>(`/api/public/yoyocode`);
        setProfile(data);
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          setProfile({
            username: "yoyocode",
            name: "Yoyo Code",
            image_url: null,
            event_types: [
              { id: 1, name: "Quick chat", slug: "chat", duration_minutes: 15, description: "Fast intro to see if we click.", location: "Google Meet", color: "#8b5cf6" },
              { id: 2, name: "Project kickoff", slug: "kickoff", duration_minutes: 45, description: "Kick off a new build.", location: "Zoom", color: "#06b6d4" },
              { id: 3, name: "Deep dive", slug: "deep-dive", duration_minutes: 60, description: "Full working session.", location: null, color: "#ec4899" },
              { id: 4, name: "Office hours", slug: "office-hours", duration_minutes: 30, description: "Drop in with a question.", location: "Google Meet", color: "#f97316" },
            ],
          });
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
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

  // Force "Yoyo Code" brand styling regardless of how the profile stores it
  const rawName = profile.name || profile.username;
  const displayName =
    rawName.toLowerCase() === "yoyo code" || rawName.toLowerCase() === "yoyocode"
      ? "Yoyo Code"
      : rawName;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#faf8ff] via-[#f5ebff] via-40% to-[#e9f2ff]">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <YoyoCodeDreamscape />
      <div className="grain" aria-hidden />

      {/* ======== NAV ======== */}
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

      {/* ======== HERO ======== */}
      <section className="relative px-6 lg:px-10 pb-12 lg:pb-20">
        <div className="max-w-2xl">
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
              {displayName}
            </span>
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground max-w-md lg:max-w-lg leading-relaxed text-pretty">
            Real humans, real calendars, zero back-and-forth. Pick any card in
            the playground below to dive in.
          </p>
        </div>
      </section>

      {/* ======== PLAYGROUND ======== */}
      <section
        id="book"
        className="relative px-4 lg:px-10 pb-16 lg:pb-24"
      >
        {profile.event_types.length === 0 ? (
          <div className="relative glass rounded-[1.5rem] p-14 text-center max-w-lg mx-auto">
            <p className="text-muted-foreground">
              No event types are available right now.
            </p>
          </div>
        ) : (
          <div className="relative w-full h-[320px] sm:h-[380px] md:h-[520px] lg:h-[680px] max-w-6xl mx-auto">
            <YoyoCodePlayground
              eventTypes={profile.event_types}
              onSelect={(event) => router.push(`/book/yoyocode/${event.slug}`)}
            />
          </div>
        )}
      </section>

      {/* ======== FALLBACK LIST (accessible, always present) ======== */}
      <section className="relative px-6 lg:px-10 pb-24 max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
            Or pick from the list
          </div>
          <h2 className="font-display text-2xl lg:text-3xl tracking-[-0.025em] leading-[1.05]">
            All meeting types
          </h2>
        </div>

        <div
          className={`grid gap-4 ${
            profile.event_types.length === 1 ? "max-w-lg mx-auto" : "md:grid-cols-2"
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
                className="relative h-full glass glass-hover rounded-[1.25rem] p-5 overflow-hidden"
                style={{ "--accent": eventType.color } as React.CSSProperties}
              >
                <div
                  aria-hidden
                  className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full opacity-80 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: eventType.color }}
                />
                <div
                  aria-hidden
                  className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-0 group-hover:opacity-60 transition-opacity duration-500 blur-2xl"
                  style={{
                    background: `radial-gradient(closest-side, ${eventType.color}, transparent)`,
                  }}
                />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 pl-2">
                    <h3 className="font-display text-xl tracking-[-0.015em] leading-[1.15] mb-1.5">
                      {eventType.name}
                    </h3>
                    <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {eventType.duration_minutes} min
                      </span>
                      {eventType.location && (
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate normal-case tracking-normal font-sans text-[12px]">
                            {eventType.location.startsWith("http")
                              ? eventType.location
                                  .replace(/^https?:\/\//, "")
                                  .split("/")[0]
                              : eventType.location}
                          </span>
                        </span>
                      )}
                    </div>
                    {eventType.description && (
                      <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed text-pretty">
                        {eventType.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-5 w-5 text-foreground/30 shrink-0 mt-1 transition-all duration-300 group-hover:text-foreground group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-16 pt-8 border-t border-foreground/5">
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
