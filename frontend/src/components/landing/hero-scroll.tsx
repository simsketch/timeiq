"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Pinned scroll scene for the hero (see .hs* in globals.css). The markup is
// server-rendered and readable without JS; this only maps scroll progress
// through the section to a few CSS variables. Phones, portrait screens and
// reduced motion get the static stacked layout and never attach a listener.
const PINNED = "(min-width: 1024px) and (min-aspect-ratio: 11/10) and (prefers-reduced-motion: no-preference)";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);

export function HeroScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia(PINNED);
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const p = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
      const s = el.style;
      s.setProperty("--c", clamp(p / 0.22).toFixed(4));
      s.setProperty("--e", ease(clamp(p / 0.4)).toFixed(4));
      s.setProperty("--m", ease(clamp((p - 0.05) / 0.4)).toFixed(4));
      s.setProperty("--b", ease(clamp((p - 0.36) / 0.24)).toFixed(4));
      s.setProperty("--t", clamp((p - 0.6) / 0.3).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const sync = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (mq.matches) {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        update();
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={ref} className="hs relative -mt-[73px] text-[#e5e5e5]">
      {children}
    </section>
  );
}
