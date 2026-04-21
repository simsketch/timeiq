"use client";

import { useEffect, useRef } from "react";

/**
 * Surrealist background layer for the /book/yoyocode hero.
 * Full Dalí — melting clocks, stilted elephants, drawered torsos,
 * crawling ants, swan-elephant reflections, flaming giraffes,
 * cursor-following eye, flapping butterfly, walking fish, snail, fried egg.
 *
 * Global mouse tracking sets --mx / --my (range -1..1) on the root,
 * so every layer can parallax at its own depth and the eye can follow cursor.
 */
export function YoyoCodeDreamscape() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let pending = { x: 0, y: 0 };

    const apply = () => {
      raf = 0;
      if (rootRef.current) {
        rootRef.current.style.setProperty("--mx", pending.x.toFixed(3));
        rootRef.current.style.setProperty("--my", pending.y.toFixed(3));
      }
    };

    const onMove = (e: MouseEvent) => {
      pending.x = (e.clientX / window.innerWidth) * 2 - 1;
      pending.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ perspective: 1600, ["--mx" as any]: 0, ["--my" as any]: 0 }}
    >
      {/* ================= SKY ================= */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 120% 55% at 50% 78%, hsl(24 90% 78% / 0.30), transparent 65%)",
            "radial-gradient(ellipse 90% 50% at 15% 40%, hsl(280 85% 75% / 0.28), transparent 60%)",
            "radial-gradient(ellipse 100% 60% at 85% 30%, hsl(192 85% 72% / 0.22), transparent 65%)",
            "radial-gradient(ellipse 70% 40% at 50% 100%, hsl(248 70% 70% / 0.35), transparent 70%)",
          ].join(","),
        }}
      />

      {/* Distant sun with faint corona — drifts slightly with cursor */}
      <Parallax
        className="absolute hidden md:block"
        depth={-14}
        style={{
          top: "9%",
          right: "18%",
          width: "min(140px, 14vw)",
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "1",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 35%, hsl(24 96% 86% / 0.95), hsl(24 90% 70% / 0.55) 55%, hsl(320 70% 60% / 0.1) 100%)",
            filter: "blur(0.5px)",
            boxShadow: "0 0 80px hsl(24 90% 72% / 0.5), 0 0 160px hsl(24 90% 72% / 0.2)",
          }}
        />
      </Parallax>

      {/* Horizon band */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: "72%",
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, hsl(248 40% 40% / 0.18) 20%, hsl(248 40% 40% / 0.18) 80%, transparent)",
          boxShadow: "0 1px 0 hsl(24 80% 75% / 0.35)",
        }}
      />

      {/* Distant mountains */}
      <Parallax
        className="absolute hidden md:block"
        depth={-6}
        style={{ left: 0, right: 0, top: "64%", width: "100%", height: "10%", opacity: 0.35 }}
      >
        <svg viewBox="0 0 1000 80" preserveAspectRatio="none" width="100%" height="100%">
          <defs>
            <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(248 35% 55%)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="hsl(248 35% 55%)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 80 L 80 50 L 150 62 L 220 40 L 290 58 L 370 35 L 460 55 L 540 42 L 620 60 L 700 38 L 780 55 L 860 45 L 940 60 L 1000 50 L 1000 80 Z"
            fill="url(#mtn)"
          />
        </svg>
      </Parallax>

      {/* ================= MELTING CLOCKS ================= */}
      <Parallax
        className="absolute hidden sm:block float-drift"
        depth={24}
        style={{
          top: "8%",
          left: "-2%",
          width: "min(220px, 22vw)",
          filter: "drop-shadow(50px 40px 30px rgba(99, 102, 241, 0.18))",
          animationDelay: "0s",
        }}
      >
        <div style={{ transform: "rotate(-14deg)" }}>
          <MeltingClock variant="A" tiltDeg={-14} />
        </div>
      </Parallax>

      <Parallax
        className="absolute hidden md:block float-drift-slow"
        depth={30}
        style={{
          top: "22%",
          right: "-3%",
          width: "min(180px, 18vw)",
          filter: "drop-shadow(-30px 50px 35px rgba(236, 72, 153, 0.2))",
          animationDelay: "-4s",
        }}
      >
        <div style={{ transform: "rotate(22deg) skew(-4deg, 2deg)" }}>
          <MeltingClock variant="B" tiltDeg={22} />
        </div>
      </Parallax>

      <Parallax
        className="absolute hidden lg:block float-drift"
        depth={18}
        style={{
          bottom: "12%",
          right: "6%",
          width: "min(140px, 14vw)",
          filter: "drop-shadow(30px 40px 30px rgba(34, 211, 238, 0.25))",
          animationDelay: "-2.5s",
        }}
      >
        <div style={{ transform: "rotate(-36deg)" }}>
          <MeltingClock variant="C" tiltDeg={-36} />
        </div>
      </Parallax>

      {/* Ground-wilted 4th clock */}
      <Parallax
        className="absolute hidden lg:block float-drift-slow"
        depth={8}
        style={{
          top: "78%",
          left: "14%",
          width: "min(70px, 7vw)",
          filter: "drop-shadow(10px 6px 8px rgba(99, 102, 241, 0.35))",
          animationDelay: "-6s",
          opacity: 0.85,
        }}
      >
        <div style={{ transform: "rotate(62deg) scaleY(0.55)" }}>
          <MeltingClock variant="A" tiltDeg={62} speed={0.7} />
        </div>
      </Parallax>

      {/* ================= STILTED ELEPHANT — with ground shadow ================= */}
      <Parallax
        className="absolute hidden md:block"
        depth={34}
        style={{ bottom: "6%", left: "3%", width: "min(180px, 18vw)" }}
      >
        <GroundShadow />
        <div className="float-drift-slow" style={{ animationDelay: "-5s" }}>
          <StiltedElephant />
        </div>
      </Parallax>

      {/* Distant smaller elephant */}
      <Parallax
        className="absolute hidden lg:block float-drift"
        depth={12}
        style={{ top: "52%", right: "38%", width: "min(90px, 9vw)", opacity: 0.55, animationDelay: "-7s" }}
      >
        <StiltedElephant />
      </Parallax>

      {/* ================= DRAWERED FIGURE ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={28}
        style={{ top: "40%", left: "2%", width: "min(140px, 12vw)" }}
      >
        <div className="float-drift" style={{ animationDelay: "-3.5s", transform: "rotate(-3deg)" }}>
          <DraweredFigure />
        </div>
      </Parallax>

      {/* ================= FLAMING GIRAFFE — with ground shadow ================= */}
      <Parallax
        className="absolute hidden md:block"
        depth={22}
        style={{ top: "12%", left: "36%", width: "min(90px, 8vw)", opacity: 0.85 }}
      >
        <div className="float-drift-slow" style={{ animationDelay: "-2s" }}>
          <FlamingGiraffe />
        </div>
      </Parallax>

      {/* ================= STRETCHED FIGURE ================= */}
      <Parallax
        className="absolute hidden lg:block float-drift-slow"
        depth={20}
        style={{ bottom: "4%", right: "28%", width: "min(80px, 7vw)", opacity: 0.75, animationDelay: "-4.5s" }}
      >
        <StretchedFigure />
      </Parallax>

      {/* ================= SWAN-ELEPHANT ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={14}
        style={{ top: "68%", left: "44%", width: "min(140px, 13vw)", opacity: 0.55 }}
      >
        <SwanElephant />
      </Parallax>

      {/* ================= LADDER ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={6}
        style={{ top: "30%", left: "58%", width: "min(60px, 5vw)", opacity: 0.45 }}
      >
        <Ladder />
      </Parallax>

      {/* ================= CURSOR-FOLLOWING EYE ================= */}
      <Parallax
        className="absolute hidden md:block"
        depth={36}
        style={{
          top: "58%",
          left: "6%",
          width: "min(110px, 11vw)",
        }}
      >
        <div className="float-drift-slow" style={{ animationDelay: "-3s", transform: "rotate(-8deg)" }}>
          <SurrealEye />
        </div>
      </Parallax>

      {/* ================= FLOATING ORBS ================= */}
      <FloatingOrb
        className="hidden sm:block"
        parallaxDepth={40}
        style={{ top: "30%", left: "40%", width: "min(52px, 5vw)", animationDelay: "-1s" }}
        color="hsl(320 85% 68%)"
        shadowTilt={18}
      />
      <FloatingOrb
        className="hidden md:block"
        parallaxDepth={28}
        style={{ top: "64%", right: "28%", width: "min(72px, 7vw)", animationDelay: "-2.5s" }}
        color="hsl(248 82% 62%)"
        shadowTilt={-22}
      />
      <FloatingOrb
        className="hidden lg:block"
        parallaxDepth={50}
        style={{ top: "18%", right: "22%", width: "min(36px, 4vw)", animationDelay: "-0.5s" }}
        color="hsl(24 94% 64%)"
        shadowTilt={10}
      />

      {/* ================= BUTTERFLY (wing-flapping, wanders) ================= */}
      <div className="absolute hidden md:block butterfly-wander" style={{ top: "20%", left: "20%" }}>
        <Butterfly />
      </div>
      <div className="absolute hidden lg:block butterfly-wander-2" style={{ top: "46%", right: "32%" }}>
        <Butterfly alt />
      </div>

      {/* ================= FISH WITH LEGS (walking) ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={16}
        style={{ top: "80%", left: "38%", width: "min(90px, 8vw)", opacity: 0.8 }}
      >
        <div className="fish-walk">
          <FishWithLegs />
        </div>
      </Parallax>

      {/* ================= SNAIL (slow crawler) ================= */}
      <div className="absolute hidden md:block snail-crawl" style={{ top: "88%", left: "8%" }}>
        <Snail />
      </div>

      {/* ================= FRIED EGG (wobbles) ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={14}
        style={{ top: "24%", right: "42%", width: "min(70px, 6vw)", opacity: 0.85 }}
      >
        <div className="egg-wobble">
          <FriedEgg />
        </div>
      </Parallax>

      {/* ================= CRAWLING ANTS ================= */}
      <Ants />

      {/* ================= KEY ON THE GROUND ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={8}
        style={{
          top: "86%",
          left: "62%",
          width: "min(80px, 7vw)",
          opacity: 0.55,
          filter: "drop-shadow(6px 4px 4px rgba(0,0,0,0.12))",
        }}
      >
        <svg viewBox="0 0 120 40" fill="none" style={{ transform: "rotate(22deg)" }}>
          <circle cx="18" cy="20" r="12" stroke="hsl(24 70% 45%)" strokeWidth="2" fill="hsl(36 85% 75%)" />
          <circle cx="18" cy="20" r="4" fill="hsl(232 40% 15%)" />
          <line x1="30" y1="20" x2="108" y2="20" stroke="hsl(24 70% 45%)" strokeWidth="2" />
          <line x1="88" y1="20" x2="88" y2="30" stroke="hsl(24 70% 45%)" strokeWidth="2" />
          <line x1="98" y1="20" x2="98" y2="28" stroke="hsl(24 70% 45%)" strokeWidth="2" />
        </svg>
      </Parallax>

      {/* ================= FLOATING ROSE ================= */}
      <Parallax
        className="absolute hidden lg:block float-drift"
        depth={18}
        style={{
          top: "26%",
          left: "22%",
          width: "min(55px, 5vw)",
          opacity: 0.8,
          animationDelay: "-1.5s",
          filter: "drop-shadow(0 10px 14px rgba(236, 72, 153, 0.25))",
        }}
      >
        <FloatingRose />
      </Parallax>

      {/* ================= IMPOSSIBLE TRIANGLE ================= */}
      <Parallax
        className="absolute hidden lg:block"
        depth={10}
        style={{ top: "50%", left: "72%", width: "min(220px, 22vw)", opacity: 0.45 }}
      >
        <svg viewBox="0 0 200 200" fill="none" style={{ transform: "rotate(18deg)" }}>
          <defs>
            <linearGradient id="wire-a" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(248 82% 62%)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="hsl(320 78% 66%)" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M 30 160 L 100 20 L 170 160 Z M 65 90 L 135 90"
            stroke="url(#wire-a)"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="100" cy="20" r="3" fill="hsl(24 94% 64%)" opacity="0.8" />
          <circle cx="30" cy="160" r="2" fill="hsl(192 85% 60%)" opacity="0.8" />
          <circle cx="170" cy="160" r="2" fill="hsl(280 80% 64%)" opacity="0.8" />
        </svg>
      </Parallax>

      {/* ================= TIME DRIPS ================= */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="drip-a" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(248 82% 62%)" stopOpacity="0" />
            <stop offset="40%" stopColor="hsl(248 82% 62%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(248 82% 62%)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="drip-b" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(320 78% 66%)" stopOpacity="0" />
            <stop offset="50%" stopColor="hsl(320 78% 66%)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(320 78% 66%)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 120 100 Q 125 400 122 720" stroke="url(#drip-a)" strokeWidth="1.2" fill="none" />
        <path d="M 780 80 Q 790 350 786 680" stroke="url(#drip-b)" strokeWidth="1" fill="none" />
        <path d="M 420 30 Q 430 280 424 580" stroke="url(#drip-a)" strokeWidth="0.8" fill="none" opacity="0.6" />
      </svg>

      {/* ================= DUST MOTES ================= */}
      <DustMotes />

      {/* ================= GRAIN ================= */}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2.7' numOctaves='3' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <style jsx>{`
        @keyframes dreamDrift {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(6px, -10px, 0); }
        }
        @keyframes dreamDriftSlow {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(-8px, 6px, 0); }
        }
        @keyframes antCrawl {
          0% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(30px) rotate(5deg); }
          50% { transform: translateX(60px) rotate(-3deg); }
          75% { transform: translateX(90px) rotate(4deg); }
          100% { transform: translateX(140px) rotate(0deg); }
        }
        @keyframes flicker {
          0%, 100% { opacity: 0.85; transform: translateY(0) scaleY(1); }
          50% { opacity: 1; transform: translateY(-2px) scaleY(1.08); }
        }
        @keyframes tickSec {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes butterflyWander {
          0%   { transform: translate3d(0, 0, 0); }
          25%  { transform: translate3d(80px, -30px, 0); }
          50%  { transform: translate3d(160px, 20px, 0); }
          75%  { transform: translate3d(90px, 60px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @keyframes butterflyWander2 {
          0%   { transform: translate3d(0, 0, 0); }
          33%  { transform: translate3d(-60px, 40px, 0); }
          66%  { transform: translate3d(-120px, -20px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @keyframes wingFlap {
          0%, 100% { transform: scaleX(1); }
          50%      { transform: scaleX(0.35); }
        }
        @keyframes wingFlapLeft {
          0%, 100% { transform: scaleX(-1); }
          50%      { transform: scaleX(-0.35); }
        }
        @keyframes fishWalk {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25%      { transform: translateX(20px) rotate(-2deg); }
          50%      { transform: translateX(40px) rotate(0deg); }
          75%      { transform: translateX(20px) rotate(2deg); }
        }
        @keyframes snailCrawl {
          0%   { transform: translateX(0); }
          100% { transform: translateX(280px); }
        }
        @keyframes eggWobble {
          0%, 100% { transform: rotate(0deg) scale(1); }
          50%      { transform: rotate(3deg) scale(1.02); }
        }
        @keyframes eyeBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          94%, 96%      { transform: scaleY(0.05); }
        }
        @keyframes mote {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate3d(120px, -180px, 0); opacity: 0; }
        }
        :global(.float-drift)       { animation: dreamDrift 11s ease-in-out infinite; }
        :global(.float-drift-slow)  { animation: dreamDriftSlow 16s ease-in-out infinite; }
        :global(.ant-crawl)         { animation: antCrawl 14s linear infinite; }
        :global(.flame-flicker)     { animation: flicker 0.5s ease-in-out infinite; transform-origin: 50% 100%; }
        :global(.tick-second)       { animation: tickSec 60s steps(60, end) infinite; transform-origin: center; transform-box: fill-box; }
        :global(.tick-minute)       { animation: tickSec 3600s linear infinite; transform-origin: center; transform-box: fill-box; }
        :global(.tick-hour)         { animation: tickSec 43200s linear infinite; transform-origin: center; transform-box: fill-box; }
        :global(.butterfly-wander)  { animation: butterflyWander 18s ease-in-out infinite; }
        :global(.butterfly-wander-2){ animation: butterflyWander2 22s ease-in-out infinite; }
        :global(.wing-r)            { animation: wingFlap 0.35s ease-in-out infinite; transform-origin: left center; transform-box: fill-box; }
        :global(.wing-l)            { animation: wingFlapLeft 0.35s ease-in-out infinite; transform-origin: right center; transform-box: fill-box; }
        :global(.fish-walk)         { animation: fishWalk 4s ease-in-out infinite; }
        :global(.snail-crawl)       { animation: snailCrawl 50s linear infinite; }
        :global(.egg-wobble)        { animation: eggWobble 3.5s ease-in-out infinite; }
        :global(.eye-blink)         { animation: eyeBlink 5s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        :global(.dust-mote)         { animation: mote 9s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          :global(.float-drift),
          :global(.float-drift-slow),
          :global(.ant-crawl),
          :global(.flame-flicker),
          :global(.tick-second),
          :global(.tick-minute),
          :global(.tick-hour),
          :global(.butterfly-wander),
          :global(.butterfly-wander-2),
          :global(.wing-r),
          :global(.wing-l),
          :global(.fish-walk),
          :global(.snail-crawl),
          :global(.egg-wobble),
          :global(.eye-blink),
          :global(.dust-mote) {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Parallax wrapper                                   */
/* -------------------------------------------------------------------------- */

function Parallax({
  depth = 20,
  className,
  style,
  children,
}: {
  depth?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className}
      style={{
        ...style,
        transform: `translate3d(calc(var(--mx, 0) * ${depth}px), calc(var(--my, 0) * ${depth}px), 0)`,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Ground Contact Shadow                              */
/* -------------------------------------------------------------------------- */

function GroundShadow() {
  return (
    <div
      aria-hidden
      className="absolute left-1/2 -translate-x-1/2 bottom-0"
      style={{
        width: "85%",
        height: "12px",
        background: "radial-gradient(ellipse at center, rgba(30,27,75,0.35), transparent 70%)",
        filter: "blur(3px)",
        zIndex: -1,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                              Melting Clock                                  */
/* -------------------------------------------------------------------------- */

function MeltingClock({
  variant,
  tiltDeg = 0,
  speed = 1,
}: {
  variant: "A" | "B" | "C";
  tiltDeg?: number;
  speed?: number;
}) {
  const colors = {
    A: { face: "#fde68a", rim: "#a78bfa", hands: "#1a1a2e" },
    B: { face: "#fbcfe8", rim: "#f472b6", hands: "#3b0764" },
    C: { face: "#bae6fd", rim: "#22d3ee", hands: "#164e63" },
  }[variant];

  const paths = {
    A: "M 10 40 C 5 60 45 75 60 80 C 80 88 120 95 140 82 C 160 70 180 50 178 35 C 176 18 160 8 120 6 C 70 4 30 12 18 22 C 12 28 12 34 10 40 Z",
    B: "M 15 35 C 10 52 35 78 62 82 C 90 86 128 95 148 78 C 168 62 176 42 170 28 C 164 12 138 4 92 6 C 52 8 22 16 15 35 Z",
    C: "M 20 30 C 14 48 40 72 66 76 C 92 80 132 78 148 64 C 164 48 168 30 158 18 C 148 8 118 2 80 5 C 45 8 24 16 20 30 Z",
  }[variant];

  // Counter the container's rotation so clock hands remain readable "up"
  const counterRot = -tiltDeg;
  const secDur = 60 / speed;

  return (
    <svg viewBox="0 0 200 120" className="w-full h-auto">
      <defs>
        <radialGradient id={`melt-face-${variant}`} cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor={colors.face} />
          <stop offset="100%" stopColor={colors.rim} stopOpacity="0.4" />
        </radialGradient>
        <linearGradient id={`melt-drip-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.face} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.rim} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path d="M 90 78 Q 88 100 95 118 Q 102 100 100 78 Z" fill={`url(#melt-drip-${variant})`} opacity="0.85" />
      <path d={paths} fill={`url(#melt-face-${variant})`} stroke={colors.rim} strokeWidth="2" />

      {/* Tick marks */}
      {[0, 3, 6, 9].map((h) => {
        const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
        const cx = 95 + Math.cos(angle) * 52;
        const cy = 44 + Math.sin(angle) * 28;
        return <circle key={h} cx={cx} cy={cy} r="2" fill={colors.hands} opacity="0.7" />;
      })}

      {/* Ticking second hand — counter-rotate, then spin */}
      <g transform={`translate(95 44) rotate(${counterRot})`}>
        <line
          className="tick-second"
          x1="0"
          y1="6"
          x2="0"
          y2="-36"
          stroke={colors.rim}
          strokeWidth="0.8"
          strokeLinecap="round"
          style={{ animationDuration: `${secDur}s` }}
        />
        <line
          className="tick-minute"
          x1="0"
          y1="4"
          x2="16"
          y2="-12"
          stroke={colors.hands}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          className="tick-hour"
          x1="0"
          y1="0"
          x2="-14"
          y2="-10"
          stroke={colors.hands}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
      <circle cx="95" cy="44" r="2.5" fill={colors.hands} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Stilted Elephant                                */
/* -------------------------------------------------------------------------- */

function StiltedElephant() {
  return (
    <svg viewBox="0 0 200 280" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="eleph-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(248 30% 38%)" />
          <stop offset="100%" stopColor="hsl(232 40% 18%)" />
        </linearGradient>
      </defs>
      <path
        d="M 50 90 Q 45 70 70 60 Q 100 52 135 58 Q 165 64 168 80 Q 172 100 160 108 L 150 112 Q 148 120 152 128 L 148 130 Q 136 122 128 118 L 80 118 Q 72 122 60 130 L 56 128 Q 60 118 58 112 L 50 108 Q 42 100 50 90 Z"
        fill="url(#eleph-body)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="1.2"
      />
      <path
        d="M 50 95 Q 30 110 28 135 Q 28 150 36 148 Q 40 140 38 128 Q 40 115 50 108"
        fill="url(#eleph-body)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="1"
      />
      <path
        d="M 135 70 Q 155 62 162 78 Q 158 92 142 90 Z"
        fill="hsl(248 25% 30%)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="1"
      />
      <circle cx="62" cy="82" r="1.5" fill="#fef3c7" />
      <path d="M 108 58 L 112 30 L 116 58 Z" fill="hsl(280 50% 35%)" stroke="hsl(232 40% 15%)" strokeWidth="0.8" />
      <circle cx="112" cy="26" r="3" fill="hsl(24 90% 65%)" />
      {/* Highlight on obelisk tip (from "sun") */}
      <circle cx="111" cy="25" r="1" fill="#fff" opacity="0.8" />
      {[66, 94, 122, 150].map((x, i) => (
        <g key={i}>
          <path
            d={`M ${x} 128 Q ${x + (i % 2 ? 2 : -2)} 180 ${x + (i % 2 ? 3 : -3)} 260`}
            stroke="hsl(232 40% 22%)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx={x + (i % 2 ? 1 : -1)} cy={175 + i * 2} r="2" fill="hsl(232 40% 22%)" />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Drawered Figure                                 */
/* -------------------------------------------------------------------------- */

function DraweredFigure() {
  return (
    <svg viewBox="0 0 160 220" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="drawer-wood" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(24 60% 82%)" />
          <stop offset="100%" stopColor="hsl(24 55% 58%)" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="22" rx="16" ry="20" fill="hsl(36 70% 86%)" stroke="hsl(24 50% 40%)" strokeWidth="1" />
      <rect x="74" y="38" width="12" height="12" fill="hsl(36 70% 86%)" stroke="hsl(24 50% 40%)" strokeWidth="1" />
      <rect x="30" y="50" width="100" height="130" fill="url(#drawer-wood)" stroke="hsl(24 50% 35%)" strokeWidth="1.2" rx="4" />
      <rect x="38" y="62" width="84" height="22" fill="hsl(24 50% 72%)" stroke="hsl(24 50% 35%)" strokeWidth="0.8" />
      <circle cx="80" cy="73" r="2" fill="hsl(24 50% 30%)" />
      <rect x="30" y="92" width="116" height="26" fill="hsl(24 55% 65%)" stroke="hsl(24 50% 35%)" strokeWidth="1" />
      <rect x="30" y="92" width="116" height="4" fill="hsl(24 40% 45%)" opacity="0.4" />
      <circle cx="90" cy="105" r="2" fill="hsl(24 50% 30%)" />
      <path d="M 118 96 Q 128 92 134 98" stroke="hsl(320 60% 50%)" strokeWidth="1.2" fill="none" />
      <rect x="38" y="126" width="84" height="22" fill="hsl(24 50% 72%)" stroke="hsl(24 50% 35%)" strokeWidth="0.8" />
      <circle cx="80" cy="137" r="2" fill="hsl(24 50% 30%)" />
      <rect x="34" y="156" width="92" height="22" fill="hsl(24 55% 65%)" stroke="hsl(24 50% 35%)" strokeWidth="0.8" />
      <circle cx="80" cy="167" r="2" fill="hsl(24 50% 30%)" />
      <line x1="52" y1="180" x2="50" y2="215" stroke="hsl(232 40% 22%)" strokeWidth="1.5" />
      <line x1="108" y1="180" x2="112" y2="215" stroke="hsl(232 40% 22%)" strokeWidth="1.5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Flaming Giraffe                                 */
/* -------------------------------------------------------------------------- */

function FlamingGiraffe() {
  return (
    <svg viewBox="0 0 120 220" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="giraffe-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(36 80% 75%)" />
          <stop offset="100%" stopColor="hsl(24 65% 50%)" />
        </linearGradient>
        <linearGradient id="flame-g" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="hsl(12 95% 55%)" />
          <stop offset="60%" stopColor="hsl(36 100% 62%)" />
          <stop offset="100%" stopColor="hsl(50 100% 78%)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="flame-core" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="hsl(48 100% 78%)" />
          <stop offset="100%" stopColor="hsl(36 100% 70%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Outer flames */}
      <g className="flame-flicker">
        <path
          d="M 40 90 Q 36 60 44 30 Q 48 55 52 35 Q 54 60 60 20 Q 64 55 70 40 Q 74 62 80 50 Q 78 80 62 92 Z"
          fill="url(#flame-g)"
          opacity="0.9"
        />
      </g>
      {/* Inner core flames (different frequency) */}
      <g className="flame-flicker" style={{ animationDuration: "0.25s" }}>
        <path
          d="M 48 85 Q 50 62 56 44 Q 58 60 62 40 Q 66 58 72 52 Q 70 78 60 88 Z"
          fill="url(#flame-core)"
          opacity="0.85"
        />
      </g>
      <path
        d="M 38 100 Q 34 92 42 88 L 80 88 Q 90 88 90 96 L 90 128 Q 90 134 82 134 L 46 134 Q 38 134 38 128 Z"
        fill="url(#giraffe-body)"
        stroke="hsl(24 50% 25%)"
        strokeWidth="1"
      />
      <circle cx="52" cy="104" r="3" fill="hsl(24 50% 30%)" />
      <circle cx="64" cy="114" r="2.5" fill="hsl(24 50% 30%)" />
      <circle cx="76" cy="106" r="2" fill="hsl(24 50% 30%)" />
      <circle cx="70" cy="122" r="2.5" fill="hsl(24 50% 30%)" />
      <path
        d="M 76 88 Q 78 72 72 56 Q 68 42 76 32"
        stroke="hsl(24 65% 55%)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="78" cy="28" rx="6" ry="4" fill="hsl(36 70% 65%)" stroke="hsl(24 50% 25%)" strokeWidth="0.8" />
      <circle cx="80" cy="27" r="0.8" fill="hsl(232 40% 15%)" />
      <line x1="76" y1="24" x2="75" y2="20" stroke="hsl(24 50% 25%)" strokeWidth="1" />
      <line x1="79" y1="24" x2="80" y2="20" stroke="hsl(24 50% 25%)" strokeWidth="1" />
      {[46, 58, 74, 86].map((x, i) => (
        <line
          key={i}
          x1={x}
          y1="134"
          x2={x + (i % 2 ? 1 : -1)}
          y2="210"
          stroke="hsl(24 60% 40%)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Stretched Figure                                */
/* -------------------------------------------------------------------------- */

function StretchedFigure() {
  return (
    <svg viewBox="0 0 100 260" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="melt-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(36 60% 70%)" />
          <stop offset="80%" stopColor="hsl(24 50% 40%)" />
          <stop offset="100%" stopColor="hsl(232 40% 20%)" />
        </linearGradient>
      </defs>
      <path
        d="M 40 10 Q 28 14 30 30 Q 26 50 34 62 Q 44 70 56 62 Q 64 48 60 30 Q 58 14 48 10 Q 44 8 40 10 Z"
        fill="url(#melt-body)"
        stroke="hsl(232 40% 20%)"
        strokeWidth="0.8"
      />
      <path
        d="M 36 62 Q 30 120 42 180 Q 46 220 44 250 Q 50 254 56 250 Q 58 220 62 180 Q 72 120 62 62 Z"
        fill="url(#melt-body)"
        stroke="hsl(232 40% 20%)"
        strokeWidth="0.8"
        opacity="0.85"
      />
      <circle cx="44" cy="32" r="1.5" fill="#0b0b14" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Swan-Elephant                                   */
/* -------------------------------------------------------------------------- */

function SwanElephant() {
  return (
    <svg viewBox="0 0 180 140" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="swan-g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(248 30% 90%)" />
          <stop offset="100%" stopColor="hsl(248 30% 65%)" />
        </linearGradient>
      </defs>
      <path
        d="M 30 60 Q 50 40 90 45 Q 130 48 140 62 Q 130 70 90 68 Q 55 66 30 60 Z"
        fill="url(#swan-g)"
        stroke="hsl(248 35% 30%)"
        strokeWidth="0.8"
      />
      <path
        d="M 130 58 Q 145 40 150 24 Q 152 18 148 16"
        stroke="hsl(248 30% 55%)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="148" cy="18" rx="5" ry="3" fill="hsl(248 30% 80%)" stroke="hsl(248 35% 30%)" strokeWidth="0.6" />
      <circle cx="150" cy="17" r="0.6" fill="hsl(232 40% 15%)" />
      <path d="M 152 18 L 157 18" stroke="hsl(24 80% 55%)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="10" y1="72" x2="170" y2="72" stroke="hsl(232 40% 40%)" strokeWidth="0.5" opacity="0.5" strokeDasharray="3 2" />
      <g transform="translate(0, 144) scale(1, -1)" opacity="0.55">
        <path
          d="M 30 60 Q 50 40 90 45 Q 130 48 140 62 Q 130 70 90 68 Q 55 66 30 60 Z"
          fill="hsl(232 35% 45%)"
          stroke="hsl(232 40% 25%)"
          strokeWidth="0.6"
        />
        <path d="M 130 58 Q 145 40 150 24" stroke="hsl(232 35% 40%)" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M 50 55 Q 40 50 45 60 Z" fill="hsl(232 30% 35%)" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Cursor-Following Eye                             */
/* -------------------------------------------------------------------------- */

function SurrealEye() {
  return (
    <svg viewBox="0 0 140 80" className="w-full h-auto">
      <defs>
        <radialGradient id="iris-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(248 82% 62%)" />
          <stop offset="70%" stopColor="hsl(280 80% 40%)" />
          <stop offset="100%" stopColor="hsl(232 40% 10%)" />
        </radialGradient>
        <clipPath id="eye-clip">
          <path d="M 10 40 Q 70 -10 130 40 Q 70 90 10 40 Z" />
        </clipPath>
      </defs>

      {/* Eye white + blink lid */}
      <g className="eye-blink">
        <path
          d="M 10 40 Q 70 -10 130 40 Q 70 90 10 40 Z"
          fill="#ffffff"
          stroke="hsl(232 40% 20%)"
          strokeWidth="1.5"
          opacity="0.9"
        />
      </g>

      {/* Iris follows cursor (--mx/--my come from root) */}
      <g
        clipPath="url(#eye-clip)"
        style={{
          transform: "translate(calc(var(--mx, 0) * 10px), calc(var(--my, 0) * 4px))",
          transition: "transform 0.12s ease-out",
        }}
      >
        <circle cx="70" cy="40" r="16" fill="url(#iris-grad)" />
        <circle cx="70" cy="40" r="6" fill="#0b0b14" />
        <circle cx="66" cy="36" r="2" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Tear */}
      <path
        d="M 70 56 Q 68 68 72 78 Q 74 68 72 56 Z"
        fill="hsl(192 85% 72%)"
        opacity="0.7"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Floating Rose                                */
/* -------------------------------------------------------------------------- */

function FloatingRose() {
  return (
    <svg viewBox="0 0 80 80" className="w-full h-auto" fill="none">
      <defs>
        <radialGradient id="rose-g" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(345 90% 85%)" />
          <stop offset="60%" stopColor="hsl(340 80% 60%)" />
          <stop offset="100%" stopColor="hsl(320 70% 30%)" />
        </radialGradient>
      </defs>
      <g transform="translate(40, 40)">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d="M 0 0 Q -14 -10 -8 -22 Q 0 -28 8 -22 Q 14 -10 0 0 Z"
            fill="url(#rose-g)"
            stroke="hsl(340 70% 30%)"
            strokeWidth="0.5"
            transform={`rotate(${i * 60}) scale(${1 - i * 0.08})`}
            opacity={0.95 - i * 0.1}
          />
        ))}
        <circle r="3" fill="hsl(345 90% 75%)" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Floating Orb w/ Long Shadow                        */
/* -------------------------------------------------------------------------- */

function FloatingOrb({
  style,
  className = "",
  color,
  shadowTilt,
  parallaxDepth = 20,
}: {
  style: React.CSSProperties;
  className?: string;
  color: string;
  shadowTilt: number;
  parallaxDepth?: number;
}) {
  return (
    <div
      className={`absolute ${className}`}
      style={{
        ...style,
        transform: `translate3d(calc(var(--mx, 0) * ${parallaxDepth}px), calc(var(--my, 0) * ${parallaxDepth}px), 0)`,
      }}
    >
      <div className="float-drift-slow" style={{ animationDelay: (style as any).animationDelay }}>
        <div
          className="relative rounded-full"
          style={{
            width: "100%",
            aspectRatio: "1",
            background: `radial-gradient(circle at 30% 30%, white 0%, ${color} 60%, #1e1b4b 100%)`,
            boxShadow: `inset -2px -4px 8px rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.12)`,
          }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-full origin-top"
          style={{
            width: "22%",
            height: "180px",
            background: `linear-gradient(to bottom, ${color}55, transparent)`,
            transform: `translateX(-50%) rotate(${shadowTilt}deg) skewX(-10deg)`,
            filter: "blur(6px)",
            opacity: 0.55,
          }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Ladder                                     */
/* -------------------------------------------------------------------------- */

function Ladder() {
  return (
    <svg viewBox="0 0 60 320" fill="none" style={{ transform: "rotate(4deg)" }}>
      <line x1="8" y1="0" x2="12" y2="320" stroke="hsl(232 40% 18%)" strokeWidth="1.5" />
      <line x1="52" y1="0" x2="48" y2="320" stroke="hsl(232 40% 18%)" strokeWidth="1.5" />
      {Array.from({ length: 11 }, (_, i) => i).map((i) => {
        const y = 20 + i * 28;
        const xOff = i * 0.2;
        return (
          <line
            key={i}
            x1={8 + xOff}
            y1={y}
            x2={52 - xOff}
            y2={y + 1}
            stroke="hsl(232 40% 24%)"
            strokeWidth="1.2"
          />
        );
      })}
      <line
        x1="30"
        y1="320"
        x2="180"
        y2="320"
        stroke="hsl(232 40% 40%)"
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity="0.4"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Crawling Ants                                 */
/* -------------------------------------------------------------------------- */

function Ants() {
  return (
    <>
      <div className="absolute hidden md:block ant-crawl" style={{ top: "82%", left: "18%", animationDelay: "0s" }}>
        <Ant />
      </div>
      <div className="absolute hidden md:block ant-crawl" style={{ top: "86%", left: "30%", animationDelay: "-3s" }}>
        <Ant />
      </div>
      <div className="absolute hidden lg:block ant-crawl" style={{ top: "90%", left: "52%", animationDelay: "-7s" }}>
        <Ant />
      </div>
      <div className="absolute hidden lg:block ant-crawl" style={{ top: "84%", left: "68%", animationDelay: "-10s" }}>
        <Ant />
      </div>
    </>
  );
}

function Ant() {
  return (
    <svg width="14" height="10" viewBox="0 0 28 20" fill="none">
      <ellipse cx="6" cy="10" rx="4" ry="3" fill="hsl(232 40% 15%)" />
      <ellipse cx="14" cy="10" rx="3" ry="2.5" fill="hsl(232 40% 15%)" />
      <ellipse cx="22" cy="10" rx="5" ry="3.5" fill="hsl(232 40% 15%)" />
      <line x1="6" y1="10" x2="3" y2="4" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="6" y1="10" x2="3" y2="17" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="14" y1="10" x2="14" y2="3" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="14" y1="10" x2="14" y2="18" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="22" y1="10" x2="26" y2="3" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="22" y1="10" x2="26" y2="17" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="2" y1="9" x2="-2" y2="5" stroke="hsl(232 40% 15%)" strokeWidth="0.5" />
      <line x1="2" y1="11" x2="-2" y2="15" stroke="hsl(232 40% 15%)" strokeWidth="0.5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Butterfly                                     */
/* -------------------------------------------------------------------------- */

function Butterfly({ alt = false }: { alt?: boolean }) {
  const hue1 = alt ? 320 : 28;
  const hue2 = alt ? 280 : 340;
  return (
    <svg width="50" height="40" viewBox="0 0 100 80" fill="none">
      <defs>
        <linearGradient id={`wing-${alt ? "b" : "a"}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={`hsl(${hue1} 90% 70%)`} />
          <stop offset="100%" stopColor={`hsl(${hue2} 80% 55%)`} />
        </linearGradient>
      </defs>
      {/* Left wing (flaps) */}
      <g className="wing-r">
        <path
          d="M 50 40 Q 20 10 10 30 Q 5 50 20 60 Q 40 55 50 40 Z"
          fill={`url(#wing-${alt ? "b" : "a"})`}
          stroke={`hsl(${hue2} 50% 25%)`}
          strokeWidth="0.8"
          opacity="0.92"
        />
        <circle cx="22" cy="32" r="3" fill="hsl(48 90% 75%)" opacity="0.8" />
        <circle cx="18" cy="48" r="2" fill="hsl(48 90% 75%)" opacity="0.8" />
      </g>
      {/* Right wing (flaps) */}
      <g className="wing-l" style={{ transformOrigin: "50px 40px" }}>
        <path
          d="M 50 40 Q 80 10 90 30 Q 95 50 80 60 Q 60 55 50 40 Z"
          fill={`url(#wing-${alt ? "b" : "a"})`}
          stroke={`hsl(${hue2} 50% 25%)`}
          strokeWidth="0.8"
          opacity="0.92"
          transform="translate(100, 0) scale(-1, 1)"
        />
        <circle cx="78" cy="32" r="3" fill="hsl(48 90% 75%)" opacity="0.8" />
        <circle cx="82" cy="48" r="2" fill="hsl(48 90% 75%)" opacity="0.8" />
      </g>
      {/* Body */}
      <ellipse cx="50" cy="42" rx="2" ry="10" fill="hsl(232 40% 15%)" />
      {/* Antennae */}
      <path d="M 50 33 Q 46 26 42 22" stroke="hsl(232 40% 15%)" strokeWidth="0.6" fill="none" />
      <path d="M 50 33 Q 54 26 58 22" stroke="hsl(232 40% 15%)" strokeWidth="0.6" fill="none" />
      <circle cx="42" cy="22" r="1" fill="hsl(232 40% 15%)" />
      <circle cx="58" cy="22" r="1" fill="hsl(232 40% 15%)" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Fish With Legs                                */
/* -------------------------------------------------------------------------- */

function FishWithLegs() {
  return (
    <svg viewBox="0 0 120 80" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="fish-g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(192 85% 70%)" />
          <stop offset="100%" stopColor="hsl(220 70% 45%)" />
        </linearGradient>
      </defs>
      {/* Body */}
      <path
        d="M 15 40 Q 20 22 55 22 Q 85 22 92 40 Q 85 58 55 58 Q 20 58 15 40 Z"
        fill="url(#fish-g)"
        stroke="hsl(220 60% 25%)"
        strokeWidth="0.8"
      />
      {/* Tail */}
      <path
        d="M 92 40 L 115 22 L 108 40 L 115 58 Z"
        fill="url(#fish-g)"
        stroke="hsl(220 60% 25%)"
        strokeWidth="0.8"
      />
      {/* Fin */}
      <path d="M 45 22 Q 50 10 60 22 Z" fill="hsl(220 70% 50%)" stroke="hsl(220 60% 25%)" strokeWidth="0.6" />
      {/* Gills */}
      <path d="M 32 30 Q 30 40 32 50" stroke="hsl(220 60% 30%)" strokeWidth="0.8" fill="none" />
      {/* Eye */}
      <circle cx="26" cy="36" r="3" fill="#fff" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <circle cx="26" cy="36" r="1.3" fill="hsl(232 40% 15%)" />
      <circle cx="25" cy="35" r="0.5" fill="#fff" />
      {/* Little human legs */}
      <line x1="40" y1="56" x2="38" y2="74" stroke="hsl(36 60% 70%)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="38" y1="74" x2="34" y2="76" stroke="hsl(232 40% 20%)" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="56" x2="63" y2="74" stroke="hsl(36 60% 70%)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="63" y1="74" x2="67" y2="76" stroke="hsl(232 40% 20%)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Snail                                     */
/* -------------------------------------------------------------------------- */

function Snail() {
  return (
    <svg width="40" height="28" viewBox="0 0 80 56" fill="none">
      <defs>
        <radialGradient id="shell-g" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="hsl(36 90% 80%)" />
          <stop offset="60%" stopColor="hsl(24 70% 55%)" />
          <stop offset="100%" stopColor="hsl(12 60% 30%)" />
        </radialGradient>
      </defs>
      {/* Body */}
      <path
        d="M 10 46 Q 6 48 12 50 Q 30 52 52 50 Q 58 48 56 42 Q 52 36 40 38 Q 22 40 12 44 Q 8 44 10 46 Z"
        fill="hsl(248 25% 45%)"
        stroke="hsl(232 40% 20%)"
        strokeWidth="0.8"
      />
      {/* Shell */}
      <circle cx="36" cy="30" r="16" fill="url(#shell-g)" stroke="hsl(12 60% 30%)" strokeWidth="0.8" />
      <path d="M 36 30 m -10 0 a 10 10 0 1 1 20 0 a 7 7 0 1 1 -14 0 a 4 4 0 1 1 8 0" stroke="hsl(12 60% 30%)" strokeWidth="0.8" fill="none" />
      {/* Antennae */}
      <line x1="8" y1="46" x2="4" y2="38" stroke="hsl(248 25% 45%)" strokeWidth="1" />
      <line x1="12" y1="46" x2="10" y2="36" stroke="hsl(248 25% 45%)" strokeWidth="1" />
      <circle cx="4" cy="38" r="1" fill="hsl(232 40% 20%)" />
      <circle cx="10" cy="36" r="1" fill="hsl(232 40% 20%)" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Fried Egg                                   */
/* -------------------------------------------------------------------------- */

function FriedEgg() {
  return (
    <svg viewBox="0 0 120 100" className="w-full h-auto" fill="none">
      <defs>
        <radialGradient id="egg-white" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="hsl(48 70% 88%)" />
        </radialGradient>
        <radialGradient id="egg-yolk" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="hsl(50 100% 85%)" />
          <stop offset="60%" stopColor="hsl(40 100% 58%)" />
          <stop offset="100%" stopColor="hsl(28 80% 40%)" />
        </radialGradient>
      </defs>
      {/* Irregular white */}
      <path
        d="M 10 50 Q 4 30 30 22 Q 40 12 60 18 Q 85 10 100 28 Q 118 42 108 62 Q 102 84 78 84 Q 58 92 38 82 Q 14 80 10 50 Z"
        fill="url(#egg-white)"
        stroke="hsl(48 40% 70%)"
        strokeWidth="0.8"
        opacity="0.95"
      />
      {/* Yolk */}
      <circle cx="58" cy="48" r="18" fill="url(#egg-yolk)" stroke="hsl(28 80% 35%)" strokeWidth="0.6" />
      {/* Highlight on yolk */}
      <ellipse cx="52" cy="42" rx="5" ry="3" fill="#fff" opacity="0.5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Dust Motes                                    */
/* -------------------------------------------------------------------------- */

function DustMotes() {
  const motes = [
    { left: "12%", top: "70%", delay: "0s", dur: "8s", size: 3 },
    { left: "28%", top: "62%", delay: "-2s", dur: "11s", size: 2 },
    { left: "48%", top: "75%", delay: "-4s", dur: "9s", size: 4 },
    { left: "66%", top: "68%", delay: "-1s", dur: "10s", size: 2 },
    { left: "78%", top: "72%", delay: "-5s", dur: "12s", size: 3 },
    { left: "88%", top: "64%", delay: "-3s", dur: "9s", size: 2 },
  ];
  return (
    <>
      {motes.map((m, i) => (
        <div
          key={i}
          className="absolute hidden md:block dust-mote"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            borderRadius: "50%",
            background: "hsl(48 100% 80% / 0.9)",
            boxShadow: "0 0 6px hsl(48 100% 80% / 0.7)",
            animationDelay: m.delay,
            animationDuration: m.dur,
          }}
        />
      ))}
    </>
  );
}
