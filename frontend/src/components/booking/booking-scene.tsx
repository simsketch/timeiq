"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { MeetingType } from "./booking-profile";

const DesertScene = dynamic(() => import("./desert-scene"), { ssr: false });

// A lightweight, live-clock illustration remains under the deferred canvas.
// Its sampled hand paths follow the same soft contour as its printed dial.
function StillWatch({ x, y, size, puddle = false, time }: {
  x: number; y: number; size: number; puddle?: boolean; time: Date | null;
}) {
  function point(a: number, b: number): [number, number] {
    if (puddle) return [a * 1.25 + b * .2, -b * .32 + .07 * Math.sin(a * 3)];
    const hinge = .32 + .1 * Math.sin(a * 2 + .4), d = Math.max(0, hinge - b);
    return [a * (1 - .13 * d) + .16 * d * d, b > hinge ? -hinge - (b - hinge) * .35 : -hinge + d * (1.04 + .3 * d ** 1.35)];
  }
  function outline(radius: number) {
    return Array.from({ length: 121 }, (_, i) => {
      const a = i / 120 * Math.PI * 2, p = point(Math.cos(a) * radius, Math.sin(a) * radius);
      return `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`;
    }).join(" ") + "Z";
  }
  function hand(angle: number, length: number) {
    return Array.from({ length: 25 }, (_, i) => {
      const d = -.09 + i / 24 * (length + .09), p = point(Math.sin(angle) * d, Math.cos(angle) * d);
      return `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`;
    }).join(" ");
  }
  const minutes = time ? time.getMinutes() + time.getSeconds() / 60 : 0;
  const hours = time ? time.getHours() % 12 + minutes / 60 : 0;
  const center = point(0, 0);
  return <g transform={`translate(${x} ${y}) scale(${size})`}>
    <path d={outline(1.025)} fill="#5d4229" stroke="#5d4229" strokeWidth=".08" transform="translate(.012 .025)" />
    <path d={outline(1)} fill="url(#booking-enamel)" stroke="url(#booking-brass)" strokeWidth=".055" />
    <path d={outline(.95)} fill="none" stroke="#a78a58" strokeWidth=".008" />
    {Array.from({ length: 12 }, (_, i) => {
      const angle = (i + 1) / 12 * Math.PI * 2, p = point(Math.sin(angle) * .72, Math.cos(angle) * .72);
      return <text key={i} x={p[0].toFixed(4)} y={p[1].toFixed(4)} fill="#5b514b" fontFamily="Georgia,serif" fontSize=".13" textAnchor="middle" dominantBaseline="central">{i + 1}</text>;
    })}
    {time && <g fill="none" stroke="#37343f" strokeLinecap="round">
      <path d={hand(hours / 12 * Math.PI * 2, .45)} strokeWidth=".031" />
      <path d={hand(minutes / 60 * Math.PI * 2, .67)} strokeWidth=".018" />
      <circle cx={center[0].toFixed(4)} cy={center[1].toFixed(4)} r=".035" fill="#b68c49" stroke="none" />
    </g>}
  </g>;
}

function StillLife({ running }: { running: boolean }) {
  const [time, setTime] = useState<Date | null>(null);
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setTime(new Date()); timer = setTimeout(tick, 60000 - Date.now() % 60000 + 20); };
    tick();
    return () => clearTimeout(timer);
  }, [running]);
  return (
    <svg width="100%" height="100%" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }} aria-hidden>
      <defs>
        <linearGradient id="booking-sky" x2="0" y2="1"><stop stopColor="#929bb9" /><stop offset=".65" stopColor="#d6beb8" /><stop offset="1" stopColor="#f4d8ad" /></linearGradient>
        <linearGradient id="booking-sand" x2=".3" y2="1"><stop stopColor="#e1c69e" /><stop offset=".5" stopColor="#c8a57b" /><stop offset="1" stopColor="#b89370" /></linearGradient>
        <linearGradient id="booking-enamel" x2="1" y2="1"><stop stopColor="#fff9e9" /><stop offset="1" stopColor="#d5c29b" /></linearGradient>
        <linearGradient id="booking-brass" x2="1" y2=".5"><stop stopColor="#e8c77d" /><stop offset=".4" stopColor="#9f6e32" /><stop offset=".7" stopColor="#efcf85" /><stop offset="1" stopColor="#72502d" /></linearGradient>
        <linearGradient id="booking-stone" x2="1" y2=".6"><stop stopColor="#d5be9d" /><stop offset="1" stopColor="#a09191" /></linearGradient>
        <radialGradient id="booking-shadow"><stop stopColor="#554046" stopOpacity=".4" /><stop offset="1" stopColor="#554046" stopOpacity="0" /></radialGradient>
      </defs>
      <path fill="url(#booking-sky)" d="M0 0H800V430H0z" />
      <path d="M80 230q190-22 350-8M330 166q180-15 370-3" fill="none" stroke="#fff2de" strokeOpacity=".14" strokeWidth="3" />
      <path fill="#b6b9bb" d="M0 408H800V445H0z" />
      <path fill="#c7a987" d="M498 421l29-45 99-9 78 28 96 15v37H498z" />
      <path fill="url(#booking-sand)" d="M0 436H800V900H0z" />
      <path d="M0 485Q180 410 366 469T800 465V540Q590 492 380 505T0 540Z" fill="#ead2a9" opacity=".5" />
      <path d="M0 782Q235 683 475 770T800 767V900H0Z" fill="#d9bb95" opacity=".6" />
      <path d="M0 791Q240 698 480 781T800 780M0 803Q240 710 480 793T800 792M0 815Q240 722 480 805T800 804" fill="none" stroke="#a48466" strokeOpacity=".12" />
      <ellipse cx="428" cy="716" rx="300" ry="37" fill="url(#booking-shadow)" />
      <path d="M175 582l271-44 128 54-9 15-271 48-123-57Z" fill="#e3ceab" />
      <path d="M172 596l123 59 270-48v108l-270 51-119-60Z" fill="url(#booking-stone)" />
      <path d="M295 656v108" stroke="#e4cfaf" strokeOpacity=".4" />
      <path d="M314 568c-48-91-30-149 24-204s27-95 10-132m-38 210c53-35 91-29 146-39m-117-58c-23-14-49-19-64-49" fill="none" stroke="#594636" strokeWidth="13" strokeLinecap="round" />
      <StillWatch x={436} y={421} size={105} time={time} />
      <StillWatch x={263} y={607} size={67} time={time} />
      <ellipse cx="605" cy="746" rx="83" ry="20" fill="url(#booking-shadow)" />
      <StillWatch x={603} y={739} size={61} puddle time={time} />
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
      <StillLife running={visible && tabVisible} />
      {ready && <SceneBoundary><DesertScene active={active} running={visible && tabVisible} reduced={reduced} small={small} /></SceneBoundary>}
    </div>
  );
}
