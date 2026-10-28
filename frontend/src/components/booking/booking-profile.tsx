"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { BookingScene } from "./booking-scene";
import { isNoScene, sceneFor } from "./scenes";
import styles from "./booking-profile.module.css";

export interface MeetingType {
  id: string;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  location: string | null;
  color: string;
}

export interface PublicProfile {
  username: string;
  name: string;
  image_url: string | null;
  booking_scene?: string | null;
  event_types: MeetingType[];
}

function locationLabel(location: string) {
  try {
    const host = new URL(location.includes("://") ? location : `https://${location}`).hostname;
    if (host === "meet.google.com") return "Google Meet";
    if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
    return host.includes(".") ? host.replace(/^www\./, "") : location;
  } catch {
    return location;
  }
}

function DurationGlyph({ minutes }: { minutes: number }) {
  const fraction = Math.min(minutes / 60, 1);
  const end = fraction * Math.PI * 2;
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 2c4.5 0 8 3.2 8 7.4 0 4.7-3.7 8.8-7.3 8.6C6.3 17.7 2 14 2 9.6 2 5.4 5.5 2 10 2Z" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      {fraction === 1 ? <circle cx="10" cy="10" r="5.5" fill="currentColor" opacity=".7" /> : (
        <path d={`M10 10 L10 4.5 A5.5 5.5 0 ${fraction > .5 ? 1 : 0} 1 ${10 + Math.sin(end) * 5.5} ${10 - Math.cos(end) * 5.5} Z`} fill="currentColor" opacity=".7" />
      )}
    </svg>
  );
}

export function BookingProfile({ profile, embed = false }: { profile: PublicProfile | null; embed?: boolean }) {
  const [hovered, setHovered] = useState<MeetingType | null>(null);
  const [focused, setFocused] = useState<MeetingType | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const active = hovered || focused;
  const scene = sceneFor(profile?.booking_scene);
  // A host can choose no scene: the page is just their profile, centered.
  const noScene = embed || isNoScene(profile?.booking_scene);
  const name = profile?.name || profile?.username || "";
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className={`${styles.page} ${noScene ? styles.noScene : ""} ${embed ? styles.embed : ""}`}>
      {embed ? null : noScene ? (
        <Link href="/" className={styles.wordmark} aria-label="TimeIQ home">
          <LogoIcon className="h-6 w-6" />
          <span className="font-display">TimeIQ</span>
        </Link>
      ) : (
      <div data-scene={scene.id} className={`${styles.art} ${scene.ink === "light" ? styles.inkLight : ""}`}>
        <BookingScene active={active} sceneId={scene.id} />
        <Link href="/" className={styles.wordmark} aria-label="TimeIQ home">
          <LogoIcon className="h-6 w-6" />
          <span className="font-display">TimeIQ</span>
        </Link>
        <div className={styles.artCaption} aria-hidden="true">
          <span>A little time, made yours.</span>
          <span className={styles.captionLine} />
        </div>
      </div>
      )}

      <div className={styles.panel}>
        <div className={styles.content}>
          {profile ? (
            <>
              <header className={styles.header}>
                <div className={styles.avatar}>
                  {profile.image_url && !avatarFailed ? (
                    // Remote profile images can come from any connected identity provider.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.image_url} alt="" width="64" height="64" onError={() => setAvatarFailed(true)} />
                  ) : <span>{initials}</span>}
                </div>
                <h1 className="font-display">Book time with <span>{name}</span></h1>
                <p>Pick a meeting to see open times.</p>
              </header>

              <div className={styles.meetings} aria-label="Meeting types">
                {profile.event_types.length === 0 ? (
                  <p className={styles.empty}>No meeting types are available right now. Check back soon.</p>
                ) : profile.event_types.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href={`/book/${encodeURIComponent(profile.username)}/${encodeURIComponent(meeting.slug)}${embed ? "?embed=1" : ""}`}
                    className={styles.meeting}
                    style={{ "--meeting-color": meeting.color } as CSSProperties}
                    onMouseEnter={() => setHovered(meeting)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setFocused(meeting)}
                    onBlur={() => setFocused(null)}
                  >
                    <div className={styles.meetingText}>
                      <h2 className="font-display">{meeting.name}</h2>
                      <div className={styles.meta}>
                        <span><DurationGlyph minutes={meeting.duration_minutes} />{meeting.duration_minutes} min</span>
                        {meeting.location && <span><MapPin size={14} aria-hidden /><span className={styles.location}>{locationLabel(meeting.location)}</span></span>}
                      </div>
                      {meeting.description?.trim() && <p className={styles.description}>{meeting.description}</p>}
                    </div>
                    <span className={styles.rowArrow}><ArrowUpRight size={19} strokeWidth={1.5} aria-hidden /></span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <header className={styles.header}>
              <h1 className="font-display">Page not found.</h1>
              <p>The booking page you&apos;re looking for doesn&apos;t exist.</p>
              <Link className={styles.homeLink} href="/">Back to TimeIQ</Link>
            </header>
          )}
        </div>

        {!embed && <footer className={styles.footer}>
          <LogoIcon className="h-4 w-4 shrink-0" />
          <p>Powered by <Link href="/?utm_source=booking_page&utm_medium=powered_by">TimeIQ</Link>, a <a href="https://yoyocode.com" target="_blank" rel="noopener noreferrer">Yoyo Code</a> creation</p>
        </footer>}
      </div>
    </main>
  );
}
