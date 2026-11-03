"use client";

import { useEffect, useRef, useState } from "react";

const SRC = "/hero/portal.mp4";

// The hero's looping video is decoration. The black stage and the copy paint
// first; the video is only added after load + idle, never under reduced motion
// or Save-Data, and it pauses whenever the hero is offscreen or the tab is hidden.
// Portrait screens get the CSS door (.hero-door) instead: there the video would
// fill the viewport and become the LCP element, and it sits behind the copy anyway.
export function HeroVideo() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce), (max-aspect-ratio: 11/10)").matches ||
      conn?.saveData ||
      /(^|-)2g$|3g/.test(conn?.effectiveType ?? "")
    ) {
      return;
    }
    const ric = typeof window.requestIdleCallback === "function";
    let idle: ReturnType<typeof setTimeout> | number = 0;
    const go = () => setEnabled(true);
    const schedule = () => {
      idle = ric ? window.requestIdleCallback(go, { timeout: 3000 }) : globalThis.setTimeout(go, 1200);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      if (ric) window.cancelIdleCallback(idle as number);
      else globalThis.clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!enabled || !video) return;
    let onScreen = true;
    const sync = () => {
      if (onScreen && !document.hidden) void video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    observer.observe(video);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <video
      ref={ref}
      src={SRC}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      onPlaying={() => setVisible(true)}
      className={`hero-video absolute inset-0 h-full w-full object-cover transition-opacity duration-[2000ms] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
