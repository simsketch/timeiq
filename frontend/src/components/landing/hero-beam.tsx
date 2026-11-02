"use client";

import { useEffect, useRef } from "react";

// The hero's light beam is pure CSS (see .hero-beam in globals.css), so it
// paints with the page and costs no download. This only pauses its slow drift
// while the hero is offscreen; reduced motion is handled in CSS.
export function HeroBeam() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => {
      el.toggleAttribute("data-paused", !e.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className="hero-beam">
      <div className="hero-beam__shaft">
        <div className="hero-beam__glow" />
        <div className="hero-beam__band">
          <div className="hero-beam__streaks" />
        </div>
      </div>
      <div className="hero-beam__grain" />
    </div>
  );
}
