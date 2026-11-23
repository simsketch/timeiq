"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { HeroAsk } from "@/components/landing/hero-ask";
import { AppStoreBadge, GooglePlayBadge } from "@/components/app-store-badge";
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

/** A clock time on the day the hero walks through, in the visitor's language. */
const at = (locale: string, hour: number, minute: number) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 10, 2, hour, minute));

/** Monday to Friday of the demo week, short names. */
const weekdays = (locale: string) =>
  [2, 3, 4, 5, 6].map((d) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 10, d)));

const beats = (t: T, locale: string): Beat[] => [
  {
    time: at(locale, 8, 15),
    title: t("b1.title"),
    body: t("b1.body"),
    card: (
      <>
        <p className="ch-label">{t("b1.label")}</p>
        <div className="mt-3 flex items-baseline gap-7">
          <p><span className="text-2xl font-medium">4</span><span className="block text-xs opacity-60">{t("b1.connected")}</span></p>
          <p><span className="text-2xl font-medium">0</span><span className="block text-xs opacity-60">{t("b1.clashes")}</span></p>
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
    time: at(locale, 10, 30),
    title: t("b2.title"),
    body: t("b2.body"),
    card: (
      <>
        <p className="ch-label">{t("b2.label")}</p>
        <p className="mt-3 text-xs opacity-60">Cc: agent@timeiq.app</p>
        <p className="mt-2 text-sm">{t("b2.card")}</p>
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
        <p className="mt-3 rounded-md bg-black/[0.06] px-2.5 py-1.5 font-mono text-xs">{t("b3.prompt")}</p>
        <p className="mt-2 text-sm">{t("b3.card")}</p>
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
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {[3, 5, 2, 6, 4].map((h, i) => (
            <span key={i} className={`flex-1 rounded-sm bg-current ${h === 6 ? "" : "opacity-25"}`} style={{ height: `${h * 15}%` }} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] opacity-55">
          {weekdays(locale).map((d) => <span key={d}>{d}</span>)}
        </div>
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
        <p className="mt-3 inline-block rounded bg-black/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]">{t("b5.added")}</p>
        <p className="mt-2 text-sm font-medium">{t("b5.subject")}</p>
        <p className="mt-1 text-xs opacity-60">{t("b5.card")}</p>
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
        <p className="mt-3 text-sm">{t("b6.card")}</p>
        <p className="mt-1 text-xs opacity-60">{t("b6.buffer")}</p>
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
        <p className="mt-3 text-xl font-medium">{t("b7.card")}</p>
        <p className="mt-1 text-xs opacity-60">{t("b7.when")}</p>
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

        <div className="ch-beat ch-intro" data-on={active === 0 ? "" : undefined}>
          <p className="ch-time">{at(locale, 6, 0)}</p>
          <h1 className="text-[2.5rem] sm:text-6xl xl:text-[4.25rem] font-normal leading-[1.04] tracking-[-0.02em] text-balance">
            <span className="block">{headline.lead}</span>
            <span className="block opacity-55">{headline.accent}</span>
          </h1>
          <p className="mt-5 max-w-[26rem] text-[16px] sm:text-[17px] leading-[1.45] opacity-70 text-pretty">
            {t("intro")}
          </p>
          <HeroAsk />
          <p className="mt-4 text-[13px] opacity-55">{t("offer")} <a href="#try" className="underline underline-offset-2">{t("tryDemo")}</a></p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AppStoreBadge placement="hero" className="h-10 w-auto" />
            <GooglePlayBadge placement="hero" className="h-10 w-auto" />
          </div>
        </div>

        {BEATS.map((b, i) => (
          <div key={i} className="ch-beat" data-on={active === i + 1 ? "" : undefined} aria-hidden={active !== i + 1}>
            <div className="ch-card">{b.card}</div>
            <div className="ch-copy">
              <p className="ch-time">{b.time}</p>
              <h2 className="text-[2rem] sm:text-5xl font-normal leading-[1.05] tracking-[-0.02em] text-balance">{b.title}</h2>
              <p className="mt-3 max-w-[24rem] text-[15px] sm:text-[17px] leading-[1.45] opacity-70 text-pretty">{b.body}</p>
              {i === BEATS.length - 1 && (
                <Link href="/sign-up" tabIndex={active === i + 1 ? 0 : -1} className="mt-6 inline-flex h-12 items-center rounded-md bg-white px-6 text-[15px] font-medium text-[#0a0a0a] transition-colors hover:bg-white/85">
                  {t("startFree")}
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
