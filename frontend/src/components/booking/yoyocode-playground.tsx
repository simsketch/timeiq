"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, ArrowUpRight } from "lucide-react";

export interface PlaygroundEventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  location: string | null;
  color: string;
}

interface Props {
  eventTypes: PlaygroundEventType[];
  onSelect: (event: PlaygroundEventType) => void;
}

/* -------------------------------------------------------------------------- */
/*                                  Clock                                     */
/* -------------------------------------------------------------------------- */

function ClockFace() {
  const hourRef = useRef<SVGGElement>(null);
  const minuteRef = useRef<SVGGElement>(null);
  const secondRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = new Date();
      const ms = now.getMilliseconds() / 1000;
      const s = now.getSeconds() + ms;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      if (hourRef.current)
        hourRef.current.style.transform = `rotate(${h * 30}deg)`;
      if (minuteRef.current)
        minuteRef.current.style.transform = `rotate(${m * 6}deg)`;
      if (secondRef.current)
        secondRef.current.style.transform = `rotate(${s * 6}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ticks = Array.from({ length: 60 }, (_, i) => i);

  return (
    <svg
      viewBox="0 0 200 200"
      className="w-full h-full drop-shadow-[0_30px_40px_rgba(99,102,241,0.35)]"
      style={{ transformStyle: "preserve-3d" }}
    >
      <defs>
        <linearGradient id="bezel-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(280 80% 64%)" />
          <stop offset="40%" stopColor="hsl(248 82% 62%)" />
          <stop offset="100%" stopColor="hsl(192 90% 58%)" />
        </linearGradient>
        <radialGradient id="face-grad" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#f5f3ff" />
          <stop offset="100%" stopColor="#ede9fe" />
        </radialGradient>
        <radialGradient id="face-shine" cx="30%" cy="20%" r="40%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id="hand-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      {/* Outer aurora ring */}
      <circle
        cx="100"
        cy="100"
        r="94"
        fill="none"
        stroke="url(#bezel-grad)"
        strokeWidth="6"
      />
      {/* Inner bezel step */}
      <circle
        cx="100"
        cy="100"
        r="89"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1"
      />
      {/* Dial */}
      <circle cx="100" cy="100" r="86" fill="url(#face-grad)" />
      {/* Glass shine */}
      <ellipse
        cx="78"
        cy="70"
        rx="55"
        ry="35"
        fill="url(#face-shine)"
        opacity="0.8"
      />

      {/* Minute ticks */}
      {ticks.map((i) => {
        const angle = (i * 6 * Math.PI) / 180;
        const isMajor = i % 5 === 0;
        const inner = isMajor ? 74 : 80;
        const outer = 84;
        const x1 = 100 + Math.sin(angle) * inner;
        const y1 = 100 - Math.cos(angle) * inner;
        const x2 = 100 + Math.sin(angle) * outer;
        const y2 = 100 - Math.cos(angle) * outer;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={isMajor ? "hsl(248 45% 22%)" : "hsl(232 15% 70%)"}
            strokeWidth={isMajor ? 1.8 : 0.8}
            strokeLinecap="round"
          />
        );
      })}

      {/* Hour numerals (12, 3, 6, 9) */}
      {[
        { n: "12", x: 100, y: 30 },
        { n: "3", x: 170, y: 104 },
        { n: "6", x: 100, y: 176 },
        { n: "9", x: 30, y: 104 },
      ].map(({ n, x, y }) => (
        <text
          key={n}
          x={x}
          y={y}
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="600"
          fontSize="11"
          fill="hsl(248 45% 22%)"
        >
          {n}
        </text>
      ))}

      {/* Brand mark below pivot */}
      <text
        x="100"
        y="128"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="5.2"
        letterSpacing="2"
        fill="hsl(248 20% 55%)"
      >
        TIMEIQ · YOYOCODE
      </text>

      {/* Hour hand */}
      <g
        ref={hourRef}
        style={{
          transformOrigin: "100px 100px",
          transition: "none",
        }}
      >
        <rect
          x="97"
          y="45"
          width="6"
          height="58"
          rx="3"
          fill="hsl(232 40% 12%)"
          filter="url(#hand-glow)"
        />
      </g>
      {/* Minute hand */}
      <g
        ref={minuteRef}
        style={{ transformOrigin: "100px 100px", transition: "none" }}
      >
        <rect
          x="97.5"
          y="22"
          width="5"
          height="82"
          rx="2.5"
          fill="hsl(248 70% 40%)"
        />
      </g>
      {/* Second hand */}
      <g
        ref={secondRef}
        style={{ transformOrigin: "100px 100px", transition: "none" }}
      >
        <rect
          x="99.3"
          y="18"
          width="1.4"
          height="88"
          rx="0.7"
          fill="hsl(24 94% 54%)"
        />
        <rect
          x="98.5"
          y="104"
          width="3"
          height="18"
          rx="1.5"
          fill="hsl(24 94% 54%)"
        />
        <circle cx="100" cy="100" r="4" fill="hsl(24 94% 54%)" />
      </g>

      {/* Pivot cap */}
      <circle cx="100" cy="100" r="3.5" fill="#ffffff" />
      <circle cx="100" cy="100" r="1.8" fill="hsl(248 70% 40%)" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Stage + cards                                 */
/* -------------------------------------------------------------------------- */

export function YoyoCodePlayground({ eventTypes, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showCards, setShowCards] = useState(false);

  useEffect(() => {
    setMounted(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 820px)");
    const updateDesktop = () => setShowCards(desktop.matches);
    updateDesktop();
    desktop.addEventListener("change", updateDesktop);

    if (reduced.matches) {
      return () => desktop.removeEventListener("change", updateDesktop);
    }

    const el = stageRef.current;
    if (!el) return () => desktop.removeEventListener("change", updateDesktop);
    let raf = 0;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      target.x = Math.max(-0.5, Math.min(0.5, py)) * -10;
      target.y = Math.max(-0.5, Math.min(0.5, px)) * 14;
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    const loop = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      setTilt({ x: current.x, y: current.y });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      desktop.removeEventListener("change", updateDesktop);
    };
  }, []);

  // Evenly distribute cards around the clock (angles in deg from 12 o'clock)
  const visible = eventTypes.slice(0, Math.min(6, eventTypes.length));
  const step = 360 / Math.max(visible.length, 1);
  // Starting offset chosen per-count so layouts look balanced and avoid
  // placing a card directly behind the "12 o'clock" numeral.
  const startOffset = visible.length === 4 ? -70 : visible.length === 3 ? -60 : -90;
  const angles = visible.map((_, i) => startOffset + step * i);

  /* ------------------------------------------------------------------ */
  /*                    Mobile layout: clock + stacked cards            */
  /* ------------------------------------------------------------------ */
  if (!showCards) {
    return (
      <div
        ref={stageRef}
        className="relative w-full select-none"
      >
        {/* Ambient glow */}
        <div
          aria-hidden
          className="absolute left-1/2 rounded-full blur-3xl opacity-60 pointer-events-none"
          style={{
            top: "180px",
            width: "min(90%, 480px)",
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            background:
              "conic-gradient(from 45deg, hsl(var(--aurora-1) / 0.45), hsl(var(--aurora-5) / 0.4), hsl(var(--aurora-4) / 0.4), hsl(var(--aurora-2) / 0.3), hsl(var(--aurora-1) / 0.45))",
          }}
        />

        <div className="relative flex flex-col items-center pt-2">
          {/* Clock hero */}
          <div style={{ width: "min(72%, 320px)", aspectRatio: 1 }}>
            <ClockFace />
          </div>

          {/* Stacked event cards — parity with desktop orbit */}
          <div
            className="w-full max-w-md flex flex-col gap-3 mt-8 px-2"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 0.6s ease, transform 0.6s ease",
              transitionDelay: "200ms",
            }}
          >
            {visible.map((event, i) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelect(event)}
                className="relative w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(var(--aurora-1))] rounded-[1.25rem] active:scale-[0.98] transition-transform"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(8px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                  transitionDelay: `${280 + i * 70}ms`,
                }}
                aria-label={`Book ${event.name} — ${event.duration_minutes} minutes`}
              >
                <div
                  className="relative glass rounded-[1.25rem] px-5 py-4 overflow-hidden"
                  style={{
                    boxShadow: `0 18px 40px -18px ${event.color}40, 0 6px 14px -6px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)`,
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
                    style={{
                      background: `linear-gradient(180deg, ${event.color}, ${event.color}99)`,
                    }}
                  />
                  <div
                    aria-hidden
                    className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-40"
                    style={{
                      background: `radial-gradient(closest-side, ${event.color}, transparent)`,
                    }}
                  />
                  <div className="relative pl-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-[17px] leading-tight tracking-[-0.015em] text-pretty mb-1.5">
                        {event.name}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {event.duration_minutes} min
                        </span>
                        {event.location && (
                          <span className="truncate normal-case tracking-normal font-sans text-[11px] text-muted-foreground/80 max-w-[160px]">
                            {event.location.startsWith("http")
                              ? event.location
                                  .replace(/^https?:\/\//, "")
                                  .split("/")[0]
                              : event.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-foreground/40" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*                    Desktop layout: orbital cards                   */
  /* ------------------------------------------------------------------ */
  return (
    <div
      ref={stageRef}
      className="relative w-full h-full flex items-center justify-center overflow-visible select-none"
      style={{ perspective: 1400 }}
    >
      {/* Ambient glow behind scene */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 rounded-full blur-3xl opacity-70 pointer-events-none"
        style={{
          width: "min(85%, 780px)",
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
          background:
            "conic-gradient(from 45deg, hsl(var(--aurora-1) / 0.5), hsl(var(--aurora-5) / 0.45), hsl(var(--aurora-4) / 0.45), hsl(var(--aurora-2) / 0.35), hsl(var(--aurora-1) / 0.5))",
        }}
      />

      <div
        className="relative"
        style={{
          width: "min(90%, 720px)",
          aspectRatio: "1",
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 0.15s ease-out",
        }}
      >
        {/* Constellation lines (desktop only) */}
        {showCards && (
          <svg
            viewBox="-360 -360 720 720"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: "translateZ(20px)" }}
          >
            {visible.map((event, i) => {
              const a = ((angles[i] - 90) * Math.PI) / 180;
              const r = 285;
              const x = Math.cos(a) * r;
              const y = Math.sin(a) * r;
              const isHover = hovered === event.id;
              return (
                <line
                  key={event.id}
                  x1={0}
                  y1={0}
                  x2={x}
                  y2={y}
                  stroke={event.color}
                  strokeWidth={isHover ? 1.5 : 0.8}
                  strokeDasharray={isHover ? "6 4" : "3 7"}
                  opacity={isHover ? 0.75 : 0.3}
                  style={{ transition: "all 0.4s ease" }}
                />
              );
            })}
          </svg>
        )}

        {/* Orbit rings (desktop only) */}
        {showCards && (
          <>
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full border border-dashed pointer-events-none"
              style={{
                width: "80%",
                aspectRatio: "1",
                borderColor: "hsl(var(--aurora-1) / 0.22)",
                transform: "translate(-50%, -50%) translateZ(5px)",
              }}
            />
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full border pointer-events-none"
              style={{
                width: "56%",
                aspectRatio: "1",
                borderColor: "hsl(var(--aurora-4) / 0.18)",
                transform: "translate(-50%, -50%) translateZ(8px)",
              }}
            />
          </>
        )}

        {/* Clock at center — larger on mobile since it's the whole hero */}
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{
            width: showCards ? "min(38%, 280px)" : "min(78%, 360px)",
            aspectRatio: "1",
            transform: "translate(-50%, -50%) translateZ(80px)",
            transition: "width 0.4s ease",
          }}
        >
          <ClockFace />
        </div>

        {/* Event cards at fixed orbital positions (desktop only) */}
        {showCards && visible.map((event, i) => {
          const a = angles[i];
          const rad = ((a - 90) * Math.PI) / 180;
          const orbit = 40; // % of container
          const leftPct = 50 + Math.cos(rad) * orbit;
          const topPct = 50 + Math.sin(rad) * orbit;
          const z = 60 + (i % 2) * 30;
          const isHover = hovered === event.id;
          const delay = mounted ? i * 90 + 200 : 0;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event)}
              onMouseEnter={() => setHovered(event.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(event.id)}
              onBlur={() => setHovered(null)}
              className="absolute text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(var(--aurora-1))] rounded-[1.25rem]"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: `translate(-50%, -50%) translateZ(${
                  isHover ? z + 30 : z
                }px) scale(${isHover ? 1.06 : 1})`,
                transformStyle: "preserve-3d",
                transition:
                  "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease",
                opacity: mounted ? 1 : 0,
                transitionDelay: `${delay}ms`,
                willChange: "transform",
              }}
              aria-label={`Book ${event.name} — ${event.duration_minutes} minutes`}
            >
              <div
                className="relative glass rounded-[1.25rem] px-5 py-4 w-[220px] overflow-hidden"
                style={{
                  boxShadow: isHover
                    ? `0 30px 60px -20px ${event.color}80, 0 8px 20px -8px rgba(15, 23, 42, 0.15), inset 0 1px 0 rgba(255,255,255,0.6)`
                    : `0 18px 40px -18px ${event.color}40, 0 6px 14px -6px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)`,
                  transition: "box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {/* Accent bar */}
                <div
                  aria-hidden
                  className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
                  style={{
                    background: `linear-gradient(180deg, ${event.color}, ${event.color}99)`,
                    boxShadow: isHover ? `0 0 12px ${event.color}` : "none",
                    transition: "box-shadow 0.4s ease",
                  }}
                />
                {/* Hover tint */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[1.25rem] transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(120% 100% at 0% 0%, ${event.color}22, transparent 60%)`,
                    opacity: isHover ? 1 : 0,
                  }}
                />
                {/* Corner shine on hover */}
                <div
                  aria-hidden
                  className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(closest-side, ${event.color}, transparent)`,
                    opacity: isHover ? 0.5 : 0,
                  }}
                />

                <div className="relative pl-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="font-display text-[17px] leading-tight tracking-[-0.015em] text-pretty">
                      {event.name}
                    </div>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 mt-0.5 transition-all duration-400"
                      style={{
                        color: isHover ? event.color : "hsl(var(--foreground) / 0.3)",
                        transform: isHover
                          ? "translate(2px, -2px)"
                          : "translate(0, 0)",
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {event.duration_minutes} min
                    </span>
                    {event.location && (
                      <span className="truncate normal-case tracking-normal font-sans text-[11px] text-muted-foreground/80 max-w-[110px]">
                        {event.location.startsWith("http")
                          ? event.location.replace(/^https?:\/\//, "").split("/")[0]
                          : event.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Anchor dot on the orbit line */}
              <div
                aria-hidden
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: "50%",
                  top: "50%",
                  width: isHover ? 10 : 6,
                  height: isHover ? 10 : 6,
                  background: event.color,
                  boxShadow: `0 0 ${isHover ? 16 : 6}px ${event.color}`,
                  transform: "translate(-50%, -50%) translateZ(-20px)",
                  transition: "all 0.4s ease",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
