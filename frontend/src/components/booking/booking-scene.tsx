"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { MeetingType } from "./booking-profile";

const DesertScene = dynamic(() => import("./desert-scene"), { ssr: false });

// This remains underneath the canvas, including while its deferred chunk loads.
function StillLife() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }} aria-hidden>
      <defs>
        <linearGradient id="booking-sky" x2="0" y2="1">
          <stop stopColor="#d6d3ed" /><stop offset=".6" stopColor="#eed6c7" /><stop offset="1" stopColor="#efb785" />
        </linearGradient>
        <linearGradient id="booking-sand" x2="0" y2="1">
          <stop stopColor="#d5a575" /><stop offset="1" stopColor="#a96e4b" />
        </linearGradient>
        <linearGradient id="booking-enamel" x2="1" y2="1">
          <stop stopColor="#fff5da" /><stop offset="1" stopColor="#d6c7ac" />
        </linearGradient>
      </defs>
      <path fill="url(#booking-sky)" d="M0 0H800V430H0z" />
      <path fill="#b0b5b9" d="M0 412H800V447H0z" />
      <path fill="#c58d63" d="M520 415l28-48 105-7 80 27 67 16v34H520z" />
      <path fill="url(#booking-sand)" d="M0 438H800V900H0z" />
      <ellipse cx="380" cy="725" rx="265" ry="18" fill="#66422f" opacity=".16" />
      <path d="M157 586l278-48 135 62-278 62z" fill="#e3c3a0" />
      <path d="M157 586l135 76v103l-135-76z" fill="#ad8060" />
      <path d="M292 662l278-62v105l-278 60z" fill="#c29774" />
      <path d="M312 568c-50-91-33-150 22-205s29-95 12-130m-41 211c53-35 90-24 147-39m-115-58c-21-17-49-22-64-52" fill="none" stroke="#614b3b" strokeWidth="16" strokeLinecap="round" />
      <path d="M402 392c77-22 108 7 95 72s-12 166-66 166-87-70-77-141-20-78 48-97z" fill="url(#booking-enamel)" stroke="#a77e38" strokeWidth="8" />
      <g fill="#554b46" fontFamily="Georgia,serif" fontSize="24" textAnchor="middle">
        <text x="426" y="427">12</text><text x="475" y="493">3</text><text x="429" y="601">6</text><text x="374" y="496">9</text>
      </g>
      <path d="M425 497l-17-49m17 49l39 39" stroke="#51494a" strokeWidth="5" strokeLinecap="round" />
      <circle cx="425" cy="497" r="7" fill="#a77e38" />
      <path d="M243 593c46-13 89-4 78 38s3 94-32 101-71-42-64-79-12-51 18-60z" fill="url(#booking-enamel)" stroke="#a77e38" strokeWidth="6" />
      <path d="M272 652l-20-23m20 23l20 23" stroke="#51494a" strokeWidth="4" />
    </svg>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function BookingScene({ active }: { active: MeetingType | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [small, setSmall] = useState(false);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 767px)");
    const preferences = () => { setReduced(motion.matches); setSmall(mobile.matches); };
    const visibility = () => setTabVisible(!document.hidden);
    preferences();
    visibility();
    motion.addEventListener("change", preferences);
    mobile.addEventListener("change", preferences);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    if (container.current) observer.observe(container.current);

    let idle: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const load = () => {
        // Avoid creating a second GPU context just to test support. If the API
        // exists but context creation fails, SceneBoundary keeps the still life.
        if ("WebGL2RenderingContext" in window) setReady(true);
      };
      // Give the host's text a paint before even requesting the Three.js chunk.
      // Phones get the still life for a few seconds longer: starting WebGL
      // there competes with the first tap on a meeting.
      if (mobile.matches) timeout = setTimeout(load, 3500);
      else if ("requestIdleCallback" in window) idle = window.requestIdleCallback(load, { timeout: 1500 });
      else timeout = setTimeout(load, 180);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timeout !== undefined) clearTimeout(timeout);
      observer.disconnect();
      motion.removeEventListener("change", preferences);
      mobile.removeEventListener("change", preferences);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <div ref={container} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      <StillLife />
      {ready && <SceneBoundary><DesertScene active={active} running={visible && tabVisible} reduced={reduced} small={small} /></SceneBoundary>}
    </div>
  );
}
