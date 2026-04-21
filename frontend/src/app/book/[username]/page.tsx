"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Clock, Calendar, MapPin, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { LogoIcon } from "@/components/logo";
import { ClockLoader } from "@/components/ui/clock-loader";

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

export default function BookingProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiFetch<UserProfile>(`/api/public/${username}`);
        setProfile(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [username]);

  if (loading) {
    return <ClockLoader fullscreen size="lg" label="Loading profile" />;
  }

  if (error || !profile) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-6">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative glass rounded-[1.5rem] p-10 text-center max-w-md">
          <h1 className="text-3xl font-display mb-3">Not found</h1>
          <p className="text-muted-foreground text-sm">
            The booking page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  const displayName = profile.name || profile.username;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />

      <div className="relative container mx-auto px-6 lg:px-10 py-16 lg:py-24 max-w-4xl">
        {/* Host header */}
        <div className="flex flex-col items-center text-center mb-14 reveal reveal-1">
          <div className="relative mb-6">
            {/* Aurora halo behind avatar */}
            <div
              aria-hidden
              className="absolute inset-0 -m-4 rounded-full opacity-70"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 50%, hsl(var(--aurora-1) / 0.45), transparent 70%)",
                filter: "blur(22px)",
              }}
            />
            {profile.image_url ? (
              <img
                src={profile.image_url}
                alt={displayName}
                className="relative w-24 h-24 rounded-full ring-1 ring-white/60 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)]"
              />
            ) : (
              <div className="relative w-24 h-24 rounded-full bg-[linear-gradient(135deg,hsl(var(--aurora-5)),hsl(var(--aurora-1)))] flex items-center justify-center text-white font-semibold text-2xl ring-1 ring-white/60 shadow-[0_20px_50px_-20px_hsl(var(--aurora-1)/0.6)]">
                {initials}
              </div>
            )}
          </div>

          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground/70 mb-3">
            Book time with
          </div>
          <h1 className="font-display text-5xl lg:text-6xl tracking-[-0.025em] leading-[1.02] mb-4">
            {displayName}
          </h1>
          <p className="text-muted-foreground text-base max-w-md">
            Choose a meeting type below to see my available times.
          </p>
        </div>

        {/* Event types */}
        {profile.event_types.length === 0 ? (
          <div className="glass rounded-[1.5rem] p-14 text-center reveal reveal-2">
            <p className="text-muted-foreground">
              No event types are available right now.
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-5 reveal reveal-2 ${
              profile.event_types.length === 1
                ? "max-w-lg mx-auto"
                : "md:grid-cols-2"
            }`}
          >
            {profile.event_types.map((eventType) => (
              <Link
                key={eventType.id}
                href={`/book/${username}/${eventType.slug}`}
                className="group"
              >
                <div
                  className="relative h-full glass glass-hover rounded-[1.5rem] p-7 overflow-hidden"
                  style={
                    {
                      "--accent": eventType.color,
                    } as React.CSSProperties
                  }
                >
                  {/* Left accent bar */}
                  <div
                    aria-hidden
                    className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r-full opacity-80 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: eventType.color }}
                  />

                  <div className="flex items-start justify-between gap-4 mb-4">
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
                    <ArrowRight
                      className="h-5 w-5 text-foreground/30 shrink-0 mt-1 transition-all duration-300 group-hover:text-foreground group-hover:translate-x-0.5"
                    />
                  </div>

                  {eventType.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                      {eventType.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-16 pt-10 border-t border-foreground/5 reveal reveal-3">
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
      </div>
    </div>
  );
}
