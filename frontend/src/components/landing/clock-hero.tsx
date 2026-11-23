"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { HeroAsk } from "@/components/landing/hero-ask";
import { ArrowRight, Check, FileText, Moon } from "lucide-react";
import { AppStoreBadge, GooglePlayBadge } from "@/components/app-store-badge";
import { FlipClock } from "@/components/landing/flip-clock";
import type { Headline } from "@/components/landing/headlines";

// Scroll-scrubbed hero: one day passes around a floating clock while life
// blurs by. The copy is server-rendered and readable without JS; the video
// (public/clock/day.mp4, 1080p; day-portrait.mp4 on phones; 7 LTX clips joined
// still to still between 8 sharpened keyframes) loads on the
// first scroll or pointer move, as a blob so seeking never waits on range
// requests; until then the poster stands in for its first frame. Reduced
// motion, Save-Data and no-JS keep the poster and the first beat.

const FRAMES = 7; // the video holds 8 keyframes, 0..7, evenly spaced
// Floor colour at each keyframe, sampled from the video; phones fade the
// video into it under the copy.
const FLOOR = ["#b3b8c1", "#919297", "#a2a6ac", "#d2c3b8", "#a3a4a7", "#ba9e88", "#7b6759", "#737274"];
// Phones (the CSS breakpoint) get a 810x1080 centre crop: half the bytes, same sharpness there.
const PHONE = "(max-width: 767px)";

type Beat = { time: string; title: string; body: string; dark?: boolean; card: React.ReactNode };
type T = ReturnType<typeof useTranslations<"landing.clock">>;

// The day's beats, in minutes past midnight: the intro at 6:00, then one per slide. The flip clock runs between them as you scroll.
const TIMES = [360, 495, 630, 750, 900, 1050, 1200, 1425];

/** A clock time on the day the hero walks through, in the visitor's language. */
const at = (locale: string, hour: number, minute: number) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 10, 2, hour, minute));

/** A weekday of the demo week (2 = Monday Nov 2) plus a time, e.g. "Tue 10:00 AM". */
const on = (locale: string, day: number, hour: number, minute: number) =>
  `${new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 10, day))} ${at(locale, hour, minute)}`;

/** Monday to Friday of the demo week, short names. */
const weekdays = (locale: string) =>
  [2, 3, 4, 5, 6].map((d) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 10, d)));

const BLUE = "#3b82f6";
const GREEN = "#16a34a";
const ORANGE = "#e8590c";
// Today's merged calendar strip: [start %, width %, colour].
const STRIP: [number, number, string][] = [[6, 8, BLUE], [20, 10, ORANGE], [38, 6, GREEN], [55, 14, BLUE], [76, 7, ORANGE]];
// Free this week, row by row across Mon-Fri: 0 busy, 1 free, 2 the slot they picked.
const FREE = [0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 2, 1, 0, 1, 0, 0, 1, 1];

const beats = (t: T, locale: string): Beat[] => [
  {
    time: at(locale, 8, 15),
    title: t("b1.title"),
    body: t("b1.body"),
    card: (
      <>
        <p className="ch-label">{t("b1.label")}</p>
        <ul className="mt-3 space-y-1.5">
          {([[BLUE, t("b1.work"), "Google"], [GREEN, t("b1.personal"), "iCloud"], [ORANGE, t("b1.clients"), "Outlook"]] as const).map(([c, name, from]) => (
            <li key={from} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
              <span className="flex-1 truncate">{name}</span>
              <span className="text-[11px] opacity-55">{from}</span>
            </li>
          ))}
        </ul>
        <div className="ch-well relative mt-3 h-3 overflow-hidden rounded-full">
          {STRIP.map(([left, width, c]) => (
            <span key={left} className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: c }} />
          ))}
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium"><Check className="h-3.5 w-3.5" style={{ color: GREEN }} />{t("b1.noClashes")}</p>
      </>
    ),
  },
  {
    time: at(locale, 10, 30),
    title: t("b2.title"),
    body: t("b2.body"),
    card: (
      <>
        <p className="ch-label">{t("b2.label")}</p>
        <p className="mt-2 text-[11px] opacity-60">CC: agent@timeiq.app</p>
        <p className="ch-well mt-2 rounded-lg px-2.5 py-2 text-xs">{t("b2.ask")}</p>
        <div className="mt-2.5 flex gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: ORANGE }}>T</span>
          <div className="min-w-0">
            <p className="text-xs opacity-70">{t("b2.replyLead")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: ORANGE }}>{on(locale, 3, 10, 0)}</span>
              <span className="ch-chip rounded-full px-2 py-0.5 text-[11px] font-medium">{on(locale, 4, 14, 30)}</span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    time: at(locale, 12, 30),
    title: t("b3.title"),
    body: t("b3.body"),
    card: (
      <>
        <p className="ch-label">{t("b3.label")}</p>
        <p className="ch-ink ml-auto mt-3 w-fit max-w-[92%] rounded-2xl rounded-br-md px-3 py-1.5 text-xs">{t("b3.prompt")}</p>
        <div className="mt-2.5 flex items-start gap-2 text-xs">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: GREEN }}><Check className="h-3 w-3" /></span>
          <div>
            <p className="font-medium">{t("b3.booked")}</p>
            <p className="ch-well mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] tabular-nums">{on(locale, 3, 9, 0)}</p>
          </div>
        </div>
      </>
    ),
  },
  {
    time: at(locale, 15, 0),
    title: t("b4.title"),
    body: t("b4.body"),
    card: (
      <>
        <p className="ch-label">{t("b4.label")}</p>
        <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] opacity-55">
          {weekdays(locale).map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-5 gap-1">
          {FREE.map((f, i) => (
            <span key={i} className={`h-3.5 rounded-[3px] ${f ? "" : "ch-well"}`} style={f ? { background: ORANGE, opacity: f === 2 ? 1 : 0.32 } : undefined} />
          ))}
        </div>
        <p className="mt-2.5 text-[11px] opacity-60">{t("b4.tap")}</p>
      </>
    ),
  },
  {
    time: at(locale, 17, 30),
    title: t("b5.title"),
    body: t("b5.body"),
    card: (
      <>
        <p className="ch-label">{t("b5.label")}</p>
        <p className="mt-2 flex items-center gap-2 text-xs font-medium"><FileText className="h-4 w-4 shrink-0 opacity-70" /><span className="truncate">{t("b5.subject")}</span></p>
        <ul className="mt-2.5 space-y-1.5 text-xs">
          {([[3, 17, 30, t("b5.practice")], [5, 17, 30, t("b5.practice")], [7, 9, 0, t("b5.game")]] as const).map(([d, h, m, name]) => (
            <li key={d} className="flex items-center gap-2">
              <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ background: GREEN }} />
              <span className="truncate"><span className="tabular-nums opacity-60">{on(locale, d, h, m)}</span> {name}</span>
            </li>
          ))}
        </ul>
        <p className="ch-well mt-2.5 inline-block rounded px-2 py-0.5 text-[10px] font-semibold">{t("b5.added")}</p>
      </>
    ),
  },
  {
    time: at(locale, 20, 0),
    title: t("b6.title"),
    body: t("b6.body"),
    dark: true,
    card: (
      <>
        <p className="ch-label">{t("b6.label")}</p>
        <p className="mt-2 text-sm">{t("b6.card")}</p>
        {/* 6:00 to midnight: work 9-6 with buffers between meetings, then the evening held. */}
        <div className="ch-well relative mt-3 h-6 overflow-hidden rounded-md">
          <span className="absolute inset-y-0 left-[16.7%] w-1/2" style={{ background: ORANGE, opacity: 0.75 }} />
          {[27, 38, 49, 60].map((x) => <span key={x} className="absolute inset-y-0 w-[2px] bg-black/40" style={{ left: `${x}%` }} />)}
          <span className="ch-night absolute inset-y-0 left-[66.7%] right-0 grid place-items-center"><Moon className="h-3.5 w-3.5" /></span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] opacity-55 tabular-nums">
          {[6, 12, 18].map((h) => <span key={h}>{new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2026, 10, 2, h))}</span>)}
          <span />
        </div>
        <p className="mt-2 text-xs font-medium">{t("b6.evening")}</p>
        <p className="mt-0.5 text-[11px] opacity-60">{t("b6.buffer")}</p>
      </>
    ),
  },
  {
    time: at(locale, 23, 45),
    title: t("b7.title"),
    body: t("b7.body"),
    dark: true,
    card: (
      <>
        <p className="ch-label"><span className="ch-dot" />{t("b7.label")}</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-semibold text-white" style={{ background: ORANGE }}>A</span>
          <div className="min-w-0">
            <p className="text-base font-medium leading-tight">{t("b7.card")}</p>
            <p className="mt-0.5 text-xs opacity-60">Aghil</p>
          </div>
        </div>
        <p className="ch-well mt-3 rounded-lg px-2.5 py-1.5 text-xs tabular-nums">{on(locale, 3, 9, 0)}</p>
      </>
    ),
  },
];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function ClockHero({ headline }: { headline: Headline }) {
  const t = useTranslations("landing.clock");
  const locale = useLocale();
  const BEATS = beats(t, locale);
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);
  const [minutes, setMinutes] = useState(TIMES[0]);

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
    let painted = false; // a real frame has drawn (iOS shows blank until one does)
    let needsGesture = false; // Low Power Mode refuses even a muted play until a tap

    const progress = () => {
      const rect = el.getBoundingClientRect();
      return clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
    };
    const step = () => {
      frame = 0;
      if (!visible) return;
      const p = progress();
      setActive(Math.round(p * FRAMES));
      // The clock runs between the beats' times as you scroll, in 5-minute steps like a station board.
      const f = p * FRAMES;
      const i = Math.min(FRAMES - 1, Math.floor(f));
      setMinutes(Math.round((TIMES[i] + (TIMES[i + 1] - TIMES[i]) * (f - i)) / 5) * 5);
      if (ready && video.duration) {
        target = p * (video.duration - 0.05);
        shown += (target - shown) * 0.2;
        if (Math.abs(target - shown) < 0.004) shown = target;
        if (Math.abs(video.currentTime - shown) > 0.008) video.currentTime = shown;
        if (shown !== target) frame = requestAnimationFrame(step);
      }
      // Back at the top with the video on its first frame, the sharper 4K poster takes over again.
      const wantLive = painted && (window.scrollY > 0 || shown > 0.05);
      if (wantLive !== shownLive) {
        shownLive = wantLive;
        setLive(wantLive);
      }
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    // iOS Safari never finishes a seek on a video that hasn't played (it stalls with
    // seeking stuck), so scrubbing waits for a muted play then pause. React's `muted`
    // prop doesn't reliably set the attribute iOS checks, so set both by hand.
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    const unlock = () =>
      video.play().then(() => {
        video.pause();
        needsGesture = false;
        ready = true;
        kick();
      });
    const onMeta = () => {
      unlock().catch(() => { needsGesture = true; });
    };
    // The poster stays up until the video has really painted a frame.
    const onSeeked = () => {
      if (!ready) return;
      painted = true;
      video.removeEventListener("seeked", onSeeked);
      kick();
    };
    video.addEventListener("seeked", onSeeked);
    // Low Power Mode: retry on a tap (touchend and click carry user activation on iOS).
    const onTap = () => { if (needsGesture) unlock().catch(() => {}); };
    window.addEventListener("touchend", onTap, { passive: true });
    window.addEventListener("click", onTap);
    const load = () => {
      fetch(window.matchMedia(PHONE).matches ? "/clock/day-portrait.mp4" : "/clock/day.mp4")
        .then((r) => r.blob())
        .then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          video.addEventListener("loadedmetadata", onMeta, { once: true });
          // preload="none" kept the element idle until now; iOS won't even read
          // metadata from the blob while it's still set.
          video.preload = "auto";
          video.src = url;
          video.load();
        })
        .catch(() => {});
    };
    // The video (8 MB, 4 MB on phones) waits for the visitor's first scroll, touch or mouse
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
      window.removeEventListener("touchend", onTap);
      window.removeEventListener("click", onTap);
      video.removeEventListener("seeked", onSeeked);
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
        <picture>
          {/* Cut from a 4K still, sharper than the video's own first frame; each screen gets one size. */}
          <source media={PHONE} sizes="100vw" srcSet="/clock/poster-portrait.webp 990w, /clock/poster-portrait-1320.webp 1320w" />
          <img src="/clock/poster.webp" srcSet="/clock/poster.webp 1920w, /clock/poster-2880.webp 2880w" sizes="100vw"
            alt="" className="ch-media" aria-hidden fetchPriority="high" />
        </picture>
        <video ref={videoRef} className="ch-media ch-video" muted playsInline preload="none" aria-hidden />
        <div aria-hidden className="ch-scrim" />

        <div className="ch-clock"><FlipClock minutes={minutes} locale={locale} /></div>

        <div className="ch-beat ch-intro" data-on={active === 0 ? "" : undefined}>
          <p className="sr-only">{at(locale, 6, 0)}</p>
          <h1 className="text-[2.5rem] sm:text-6xl xl:text-[4.25rem] font-normal leading-[1.04] tracking-[-0.02em] text-balance">
            <span className="block">{headline.lead}</span>
            <span className="block opacity-55">{headline.accent}</span>
          </h1>
          <p className="mt-5 max-w-[26rem] text-[16px] sm:text-[17px] leading-[1.45] opacity-70 text-pretty">
            {t("intro")}
          </p>
          <HeroAsk />
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="ch-offer"><Check className="h-4 w-4 shrink-0" style={{ color: GREEN }} />{t("offer")}</p>
            <a href="#try" className="text-[14px] font-medium underline underline-offset-4 opacity-80 hover:opacity-100">{t("tryDemo")}</a>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AppStoreBadge placement="hero" className="h-10 w-auto" />
            <GooglePlayBadge placement="hero" className="h-10 w-auto" />
          </div>
        </div>

        {BEATS.map((b, i) => (
          <div key={i} className="ch-beat" data-on={active === i + 1 ? "" : undefined} aria-hidden={active !== i + 1}>
            <div className="ch-card">{b.card}</div>
            <div className="ch-copy">
              <p className="sr-only">{b.time}</p>
              <h2 className="text-[2rem] sm:text-5xl font-normal leading-[1.05] tracking-[-0.02em] text-balance">{b.title}</h2>
              <p className="mt-3 max-w-[24rem] text-[15px] sm:text-[17px] leading-[1.45] opacity-70 text-pretty">{b.body}</p>
              {i === BEATS.length - 1 && (
                <div className="mt-7 flex flex-col items-start gap-4">
                  <Link href="/sign-up" tabIndex={active === i + 1 ? 0 : -1} className="ch-cta">
                    {t("startFree")}
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                  <p className="ch-offer ch-offer--night"><Check className="h-4 w-4 shrink-0" />{t("offer")}</p>
                </div>
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
