"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Headline } from "@/components/landing/headlines";

// Scroll-scrubbed hero: one day passes around a floating clock while life
// blurs by. The copy is server-rendered and readable without JS; the video
// (public/clock/day.mp4, 7 Tein clips joined still to still) loads on the
// first scroll or pointer move, as a blob so seeking never waits on range
// requests; until then the poster stands in for its first frame. Reduced
// motion, Save-Data and no-JS keep the poster and the first beat.

const FRAMES = 7; // the video holds 8 keyframes, 0..7, evenly spaced
// Floor colour at each keyframe, sampled from the video; phones fade the
// video into it under the copy.
const FLOOR = ["#adb2ba", "#a0a0a5", "#9fa4ac", "#c2b5ae", "#9e9fa4", "#b79d89", "#7c6657", "#726e6e"];

type Beat = { time: string; title: string; body: string; dark?: boolean; card: React.ReactNode };

const BEATS: Beat[] = [
  {
    time: "8:15 AM",
    title: "All your calendars. One booking link.",
    body: "Google, Outlook and iCloud, checked live. Nobody books over your dentist.",
    card: (
      <>
        <p className="ch-label">Your calendars</p>
        <div className="mt-3 flex items-baseline gap-7">
          <p><span className="text-2xl font-medium">4</span><span className="block text-xs opacity-60">connected</span></p>
          <p><span className="text-2xl font-medium">0</span><span className="block text-xs opacity-60">clashes</span></p>
        </div>
        <div className="mt-3 flex h-2 gap-1">
          <span className="w-[46%] rounded-full bg-current" />
          <span className="w-[26%] rounded-full bg-current opacity-50" />
          <span className="w-[16%] rounded-full bg-current opacity-30" />
          <span className="w-[12%] rounded-full bg-current opacity-15" />
        </div>
      </>
    ),
  },
  {
    time: "10:30 AM",
    title: "Cc TimeIQ. It finds the time.",
    body: "Add it to any email thread. It replies with times that work for everyone.",
    card: (
      <>
        <p className="ch-label">Re: Kickoff next week</p>
        <p className="mt-3 text-xs opacity-60">Cc: agent@timeiq.app</p>
        <p className="mt-2 text-sm">Tue 10:00 AM or Wed 2:30 PM work for both of you.</p>
      </>
    ),
  },
  {
    time: "12:30 PM",
    title: "Ask Claude or ChatGPT.",
    body: "Say it in plain words. It's on both calendars before lunch is over.",
    card: (
      <>
        <p className="ch-label">Ask your AI</p>
        <p className="mt-3 rounded-md bg-black/[0.06] px-2.5 py-1.5 font-mono text-xs">book 30 min with Aghil Tuesday</p>
        <p className="mt-2 text-sm">Booked Tue 9:00 AM. Invite sent.</p>
      </>
    ),
  },
  {
    time: "3:00 PM",
    title: "Share your free time as a picture.",
    body: "Drop your availability into any chat. They pick a time, you're booked.",
    card: (
      <>
        <p className="ch-label">Free this week</p>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {[3, 5, 2, 6, 4].map((h, i) => (
            <span key={i} className={`flex-1 rounded-sm bg-current ${h === 6 ? "" : "opacity-25"}`} style={{ height: `${h * 15}%` }} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] opacity-55">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
        </div>
      </>
    ),
  },
  {
    time: "5:30 PM",
    title: "Forward the soccer schedule.",
    body: "Any PDF, screenshot or email. Every practice and game lands on your calendar.",
    card: (
      <>
        <p className="ch-label">Forwarded</p>
        <p className="mt-3 inline-block rounded bg-black/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]">9 events added</p>
        <p className="mt-2 text-sm font-medium">Fw: U10 fall soccer schedule</p>
        <p className="mt-1 text-xs opacity-60">Practice Tue &amp; Thu 5:30 PM · Games Sat 9 AM</p>
      </>
    ),
  },
  {
    time: "8:00 PM",
    title: "Never double-booked over dinner.",
    body: "Working hours and buffers keep your evenings yours.",
    dark: true,
    card: (
      <>
        <p className="ch-label">Working hours</p>
        <p className="mt-3 text-sm">Mon – Fri, 9:00 AM – 6:00 PM</p>
        <p className="mt-1 text-xs opacity-60">15 min buffer between meetings</p>
      </>
    ),
  },
  {
    time: "11:45 PM",
    title: "Booked while you slept.",
    body: "Your link fills the week while you rest. Your first 7 meetings are free.",
    dark: true,
    card: (
      <>
        <p className="ch-label"><span className="ch-dot" />Next up</p>
        <p className="mt-3 text-xl font-medium">Intro call</p>
        <p className="mt-1 text-xs opacity-60">Aghil · Tue 9:00 – 9:30 AM</p>
      </>
    ),
  },
];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function ClockHero({ headline }: { headline: Headline }) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (still || saveData) return;
    el.dataset.scrub = "";

    let url = "";
    let ready = false;
    let target = 0;
    let shown = 0;
    let frame = 0;
    let visible = true;
    let cancelled = false;
    let shownLive = false;

    const progress = () => {
      const rect = el.getBoundingClientRect();
      return clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
    };
    const step = () => {
      frame = 0;
      if (!visible) return;
      const p = progress();
      setActive(Math.round(p * FRAMES));
      if (ready && !shownLive && window.scrollY > 0) {
        shownLive = true;
        setLive(true);
      }
      if (ready && video.duration) {
        target = p * (video.duration - 0.05);
        shown += (target - shown) * 0.2;
        if (Math.abs(target - shown) < 0.004) shown = target;
        if (Math.abs(video.currentTime - shown) > 0.008) video.currentTime = shown;
        if (shown !== target) frame = requestAnimationFrame(step);
      }
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    // Phones and mobile Safari only seek a video that has played once.
    const onMeta = () => {
      video.play().then(() => video.pause()).catch(() => {}).finally(() => {
        ready = true;
        kick();
      });
    };
    const load = () => {
      fetch("/clock/day.mp4")
        .then((r) => r.blob())
        .then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          video.addEventListener("loadedmetadata", onMeta, { once: true });
          video.src = url;
        })
        .catch(() => {});
    };
    // The 5 MB video waits for the visitor's first scroll, touch or mouse
    // move, so it never competes with first paint and bouncers skip it.
    const intents = ["scroll", "pointermove", "touchstart", "keydown"] as const;
    const start = () => {
      intents.forEach((e) => window.removeEventListener(e, start));
      load();
    };
    intents.forEach((e) => window.addEventListener(e, start, { once: true, passive: true }));

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
    });
    io.observe(el);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick, { passive: true });
    kick();

    return () => {
      cancelled = true;
      io.disconnect();
      intents.forEach((e) => window.removeEventListener(e, start));
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      cancelAnimationFrame(frame);
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const dark = active > 0 && BEATS[active - 1]?.dark;

  return (
    <section ref={ref} className={`ch relative -mt-[73px]${live ? " ch--live" : ""}`} data-dark={dark ? "" : undefined}
      style={{ "--ch-floor": FLOOR[active] } as React.CSSProperties}
    >
      <div className="ch-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/clock/poster.jpg" alt="" className="ch-media" aria-hidden fetchPriority="high" />
        <video ref={videoRef} className="ch-media ch-video" muted playsInline preload="none" aria-hidden />
        <div aria-hidden className="ch-scrim" />

        <div className="ch-beat ch-intro" data-on={active === 0 ? "" : undefined}>
          <p className="ch-time">6:00 AM</p>
          <h1 className="text-[2.5rem] sm:text-6xl xl:text-[4.25rem] font-normal leading-[1.04] tracking-[-0.02em] text-balance">
            <span className="block">{headline.lead}</span>
            <span className="block opacity-55">{headline.accent}</span>
          </h1>
          <p className="mt-5 max-w-[26rem] text-[16px] sm:text-[17px] leading-[1.45] opacity-70 text-pretty">
            Life moves fast. TimeIQ keeps time for you: forward a schedule, cc a thread, or ask your AI.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/sign-up" className="inline-flex h-12 items-center rounded-md bg-[#141414] px-6 text-[15px] font-medium text-white transition-colors hover:bg-black">
              Start free
            </Link>
            <a href="#try" className="inline-flex h-12 items-center rounded-md border border-black/15 bg-white/60 px-6 text-[15px] font-medium backdrop-blur transition-colors hover:bg-white/80">
              Try the demo
            </a>
          </div>
          <p className="mt-4 text-[13px] opacity-55">First 7 meetings free, no card. Then $19 a year.</p>
        </div>

        {BEATS.map((b, i) => (
          <div key={b.time} className="ch-beat" data-on={active === i + 1 ? "" : undefined} aria-hidden={active !== i + 1}>
            <div className="ch-card">{b.card}</div>
            <div className="ch-copy">
              <p className="ch-time">{b.time}</p>
              <h2 className="text-[2rem] sm:text-5xl font-normal leading-[1.05] tracking-[-0.02em] text-balance">{b.title}</h2>
              <p className="mt-3 max-w-[24rem] text-[15px] sm:text-[17px] leading-[1.45] opacity-70 text-pretty">{b.body}</p>
              {i === BEATS.length - 1 && (
                <Link href="/sign-up" tabIndex={active === i + 1 ? 0 : -1} className="mt-6 inline-flex h-12 items-center rounded-md bg-white px-6 text-[15px] font-medium text-[#0a0a0a] transition-colors hover:bg-white/85">
                  Start free
                </Link>
              )}
            </div>
          </div>
        ))}

        <div aria-hidden className="ch-progress">
          {Array.from({ length: FRAMES + 1 }, (_, i) => (
            <span key={i} data-on={i <= active ? "" : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}
