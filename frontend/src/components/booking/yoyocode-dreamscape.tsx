"use client";

/**
 * Surrealist background layer for the /book/yoyocode hero.
 * Full Dalí — melting clocks, spindle-legged elephants, drawered torsos,
 * crawling ants, swan-elephant reflections, flaming giraffes.
 * Absolute-positioned, purely decorative (aria-hidden).
 */
export function YoyoCodeDreamscape() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ perspective: 1600 }}
    >
      {/* ================= HORIZON / SKY ================= */}
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

      {/* Second sun / moon */}
      <div
        className="absolute hidden md:block"
        style={{
          top: "9%",
          right: "18%",
          width: "min(140px, 14vw)",
          aspectRatio: "1",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 35%, hsl(24 96% 86% / 0.95), hsl(24 90% 70% / 0.55) 55%, hsl(320 70% 60% / 0.1) 100%)",
          filter: "blur(0.5px)",
          boxShadow: "0 0 80px hsl(24 90% 72% / 0.4)",
        }}
      />

      {/* Faint horizon band */}
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

      {/* Distant desert mountains */}
      <svg
        className="absolute hidden md:block"
        style={{ left: 0, right: 0, top: "64%", width: "100%", height: "10%", opacity: 0.35 }}
        viewBox="0 0 1000 80"
        preserveAspectRatio="none"
      >
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

      {/* ================= MELTING CLOCKS ================= */}
      <div
        className="absolute hidden sm:block float-drift"
        style={{
          top: "8%",
          left: "-2%",
          width: "min(220px, 22vw)",
          transform: "rotate(-14deg)",
          filter: "drop-shadow(50px 40px 30px rgba(99, 102, 241, 0.18))",
          animationDelay: "0s",
        }}
      >
        <MeltingClock variant="A" />
      </div>

      <div
        className="absolute hidden md:block float-drift-slow"
        style={{
          top: "22%",
          right: "-3%",
          width: "min(180px, 18vw)",
          transform: "rotate(22deg) skew(-4deg, 2deg)",
          filter: "drop-shadow(-30px 50px 35px rgba(236, 72, 153, 0.2))",
          animationDelay: "-4s",
        }}
      >
        <MeltingClock variant="B" />
      </div>

      <div
        className="absolute hidden lg:block float-drift"
        style={{
          bottom: "12%",
          right: "6%",
          width: "min(140px, 14vw)",
          transform: "rotate(-36deg)",
          filter: "drop-shadow(30px 40px 30px rgba(34, 211, 238, 0.25))",
          animationDelay: "-2.5s",
        }}
      >
        <MeltingClock variant="C" />
      </div>

      {/* 4th tiny melting clock — on the ground plane */}
      <div
        className="absolute hidden lg:block float-drift-slow"
        style={{
          top: "78%",
          left: "14%",
          width: "min(70px, 7vw)",
          transform: "rotate(62deg) scaleY(0.55)",
          filter: "drop-shadow(10px 6px 8px rgba(99, 102, 241, 0.35))",
          animationDelay: "-6s",
          opacity: 0.85,
        }}
      >
        <MeltingClock variant="A" />
      </div>

      {/* ================= ELEPHANT ON SPINDLE LEGS (iconic Dalí) ================= */}
      <div
        className="absolute hidden md:block float-drift-slow"
        style={{
          bottom: "6%",
          left: "3%",
          width: "min(180px, 18vw)",
          animationDelay: "-5s",
        }}
      >
        <StiltedElephant />
      </div>

      {/* Smaller stilt elephant in the distance */}
      <div
        className="absolute hidden lg:block float-drift"
        style={{
          top: "52%",
          right: "38%",
          width: "min(90px, 9vw)",
          opacity: 0.55,
          animationDelay: "-7s",
        }}
      >
        <StiltedElephant />
      </div>

      {/* ================= DRAWERED TORSO (Anthropomorphic Cabinet) ================= */}
      <div
        className="absolute hidden lg:block float-drift"
        style={{
          top: "40%",
          left: "2%",
          width: "min(140px, 12vw)",
          transform: "rotate(-3deg)",
          animationDelay: "-3.5s",
        }}
      >
        <DraweredFigure />
      </div>

      {/* ================= FLAMING GIRAFFE ================= */}
      <div
        className="absolute hidden md:block float-drift-slow"
        style={{
          top: "12%",
          left: "36%",
          width: "min(90px, 8vw)",
          animationDelay: "-2s",
          opacity: 0.8,
        }}
      >
        <FlamingGiraffe />
      </div>

      {/* ================= STRETCHED FIGURE (far right) ================= */}
      <div
        className="absolute hidden lg:block float-drift-slow"
        style={{
          bottom: "4%",
          right: "28%",
          width: "min(80px, 7vw)",
          animationDelay: "-4.5s",
          opacity: 0.7,
        }}
      >
        <StretchedFigure />
      </div>

      {/* ================= SWAN-ELEPHANT REFLECTION ================= */}
      <div
        className="absolute hidden lg:block"
        style={{
          top: "68%",
          left: "44%",
          width: "min(140px, 13vw)",
          opacity: 0.55,
        }}
      >
        <SwanElephant />
      </div>

      {/* ================= LADDER TO NOWHERE ================= */}
      <Ladder />

      {/* ================= SURREAL EYE ================= */}
      <div
        className="absolute hidden md:block float-drift-slow"
        style={{
          top: "58%",
          left: "6%",
          width: "min(110px, 11vw)",
          transform: "rotate(-8deg)",
          animationDelay: "-3s",
        }}
      >
        <SurrealEye />
      </div>

      {/* ================= FLOATING ORBS ================= */}
      <FloatingOrb
        className="hidden sm:block"
        style={{
          top: "30%",
          left: "40%",
          width: "min(52px, 5vw)",
          animationDelay: "-1s",
        }}
        color="hsl(320 85% 68%)"
        shadowTilt={18}
      />
      <FloatingOrb
        className="hidden md:block"
        style={{
          top: "64%",
          right: "28%",
          width: "min(72px, 7vw)",
          animationDelay: "-2.5s",
        }}
        color="hsl(248 82% 62%)"
        shadowTilt={-22}
      />
      <FloatingOrb
        className="hidden lg:block"
        style={{
          top: "18%",
          right: "22%",
          width: "min(36px, 4vw)",
          animationDelay: "-0.5s",
        }}
        color="hsl(24 94% 64%)"
        shadowTilt={10}
      />

      {/* ================= CRAWLING ANTS ================= */}
      <Ants />

      {/* ================= KEY ON THE GROUND ================= */}
      <svg
        className="absolute hidden lg:block"
        style={{
          top: "86%",
          left: "62%",
          width: "min(80px, 7vw)",
          opacity: 0.55,
          transform: "rotate(22deg)",
          filter: "drop-shadow(6px 4px 4px rgba(0,0,0,0.12))",
        }}
        viewBox="0 0 120 40"
        fill="none"
      >
        <circle cx="18" cy="20" r="12" stroke="hsl(24 70% 45%)" strokeWidth="2" fill="hsl(36 85% 75%)" />
        <circle cx="18" cy="20" r="4" fill="hsl(232 40% 15%)" />
        <line x1="30" y1="20" x2="108" y2="20" stroke="hsl(24 70% 45%)" strokeWidth="2" />
        <line x1="88" y1="20" x2="88" y2="30" stroke="hsl(24 70% 45%)" strokeWidth="2" />
        <line x1="98" y1="20" x2="98" y2="28" stroke="hsl(24 70% 45%)" strokeWidth="2" />
      </svg>

      {/* ================= FLOATING ROSE ================= */}
      <div
        className="absolute hidden lg:block float-drift"
        style={{
          top: "26%",
          left: "22%",
          width: "min(55px, 5vw)",
          opacity: 0.75,
          animationDelay: "-1.5s",
          filter: "drop-shadow(0 10px 14px rgba(236, 72, 153, 0.25))",
        }}
      >
        <FloatingRose />
      </div>

      {/* ================= IMPOSSIBLE TRIANGLE ================= */}
      <svg
        className="absolute hidden lg:block"
        style={{
          top: "50%",
          left: "72%",
          width: "min(220px, 22vw)",
          opacity: 0.45,
          transform: "rotate(18deg)",
        }}
        viewBox="0 0 200 200"
        fill="none"
      >
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

      {/* ================= TIME DRIPS (long vertical lines) ================= */}
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

      {/* ================= GRAIN ================= */}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2.7' numOctaves='3' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <style jsx>{`
        @keyframes dreamDrift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--r, 0deg)); }
          50% { transform: translate3d(6px, -10px, 0) rotate(var(--r, 0deg)); }
        }
        @keyframes dreamDriftSlow {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--r, 0deg)); }
          50% { transform: translate3d(-8px, 6px, 0) rotate(var(--r, 0deg)); }
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
        :global(.float-drift) { animation: dreamDrift 11s ease-in-out infinite; }
        :global(.float-drift-slow) { animation: dreamDriftSlow 16s ease-in-out infinite; }
        :global(.ant-crawl) { animation: antCrawl 14s linear infinite; }
        :global(.flame-flicker) { animation: flicker 0.5s ease-in-out infinite; transform-origin: 50% 100%; }
        @media (prefers-reduced-motion: reduce) {
          :global(.float-drift),
          :global(.float-drift-slow),
          :global(.ant-crawl),
          :global(.flame-flicker) {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Melting Clock                                  */
/* -------------------------------------------------------------------------- */

function MeltingClock({ variant }: { variant: "A" | "B" | "C" }) {
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
      <path
        d="M 90 78 Q 88 100 95 118 Q 102 100 100 78 Z"
        fill={`url(#melt-drip-${variant})`}
        opacity="0.85"
      />
      <path d={paths} fill={`url(#melt-face-${variant})`} stroke={colors.rim} strokeWidth="2" />
      {[0, 3, 6, 9].map((h) => {
        const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
        const cx = 95 + Math.cos(angle) * 52;
        const cy = 44 + Math.sin(angle) * 28;
        return <circle key={h} cx={cx} cy={cy} r="2" fill={colors.hands} opacity="0.7" />;
      })}
      <line x1="95" y1="44" x2="75" y2="28" stroke={colors.hands} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="95" y1="44" x2="118" y2="36" stroke={colors.hands} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="95" cy="44" r="2.5" fill={colors.hands} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Stilted Elephant                                */
/* -------------------------------------------------------------------------- */
/* Dalí's "The Elephants" / "The Temptation of St. Anthony" — impossible legs. */

function StiltedElephant() {
  return (
    <svg viewBox="0 0 200 280" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="eleph-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(248 30% 38%)" />
          <stop offset="100%" stopColor="hsl(232 40% 18%)" />
        </linearGradient>
      </defs>
      {/* Body silhouette */}
      <path
        d="M 50 90 Q 45 70 70 60 Q 100 52 135 58 Q 165 64 168 80 Q 172 100 160 108 L 150 112 Q 148 120 152 128 L 148 130 Q 136 122 128 118 L 80 118 Q 72 122 60 130 L 56 128 Q 60 118 58 112 L 50 108 Q 42 100 50 90 Z"
        fill="url(#eleph-body)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="1.2"
      />
      {/* Trunk */}
      <path
        d="M 50 95 Q 30 110 28 135 Q 28 150 36 148 Q 40 140 38 128 Q 40 115 50 108"
        fill="url(#eleph-body)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="1"
      />
      {/* Ear */}
      <path
        d="M 135 70 Q 155 62 162 78 Q 158 92 142 90 Z"
        fill="hsl(248 25% 30%)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="1"
      />
      {/* Eye */}
      <circle cx="62" cy="82" r="1.5" fill="#fef3c7" />
      {/* Tiny obelisk on back */}
      <path
        d="M 108 58 L 112 30 L 116 58 Z"
        fill="hsl(280 50% 35%)"
        stroke="hsl(232 40% 15%)"
        strokeWidth="0.8"
      />
      <circle cx="112" cy="26" r="3" fill="hsl(24 90% 65%)" />
      {/* Impossibly long spindle legs */}
      {[66, 94, 122, 150].map((x, i) => (
        <g key={i}>
          <path
            d={`M ${x} 128 Q ${x + (i % 2 ? 2 : -2)} 180 ${x + (i % 2 ? 3 : -3)} 260`}
            stroke="hsl(232 40% 22%)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          {/* knee joint */}
          <circle cx={x + (i % 2 ? 1 : -1)} cy={175 + i * 2} r="2" fill="hsl(232 40% 22%)" />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Drawered Figure                                 */
/* -------------------------------------------------------------------------- */
/* Nod to "The Anthropomorphic Cabinet" — a torso with half-open drawers.     */

function DraweredFigure() {
  return (
    <svg viewBox="0 0 160 220" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="drawer-wood" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(24 60% 82%)" />
          <stop offset="100%" stopColor="hsl(24 55% 58%)" />
        </linearGradient>
      </defs>
      {/* Head */}
      <ellipse cx="80" cy="22" rx="16" ry="20" fill="hsl(36 70% 86%)" stroke="hsl(24 50% 40%)" strokeWidth="1" />
      {/* Neck */}
      <rect x="74" y="38" width="12" height="12" fill="hsl(36 70% 86%)" stroke="hsl(24 50% 40%)" strokeWidth="1" />
      {/* Torso with drawers */}
      <rect x="30" y="50" width="100" height="130" fill="url(#drawer-wood)" stroke="hsl(24 50% 35%)" strokeWidth="1.2" rx="4" />
      {/* Closed drawer 1 */}
      <rect x="38" y="62" width="84" height="22" fill="hsl(24 50% 72%)" stroke="hsl(24 50% 35%)" strokeWidth="0.8" />
      <circle cx="80" cy="73" r="2" fill="hsl(24 50% 30%)" />
      {/* Open drawer 2 */}
      <rect x="30" y="92" width="116" height="26" fill="hsl(24 55% 65%)" stroke="hsl(24 50% 35%)" strokeWidth="1" />
      <rect x="30" y="92" width="116" height="4" fill="hsl(24 40% 45%)" opacity="0.4" />
      <circle cx="90" cy="105" r="2" fill="hsl(24 50% 30%)" />
      {/* Strange items spilling out */}
      <path d="M 118 96 Q 128 92 134 98" stroke="hsl(320 60% 50%)" strokeWidth="1.2" fill="none" />
      {/* Closed drawer 3 */}
      <rect x="38" y="126" width="84" height="22" fill="hsl(24 50% 72%)" stroke="hsl(24 50% 35%)" strokeWidth="0.8" />
      <circle cx="80" cy="137" r="2" fill="hsl(24 50% 30%)" />
      {/* Bottom drawer open slightly */}
      <rect x="34" y="156" width="92" height="22" fill="hsl(24 55% 65%)" stroke="hsl(24 50% 35%)" strokeWidth="0.8" />
      <circle cx="80" cy="167" r="2" fill="hsl(24 50% 30%)" />
      {/* Spindle legs */}
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
      </defs>
      {/* Back flames */}
      <g className="flame-flicker">
        <path
          d="M 40 90 Q 36 60 44 30 Q 48 55 52 35 Q 54 60 60 20 Q 64 55 70 40 Q 74 62 80 50 Q 78 80 62 92 Z"
          fill="url(#flame-g)"
          opacity="0.9"
        />
      </g>
      {/* Body */}
      <path
        d="M 38 100 Q 34 92 42 88 L 80 88 Q 90 88 90 96 L 90 128 Q 90 134 82 134 L 46 134 Q 38 134 38 128 Z"
        fill="url(#giraffe-body)"
        stroke="hsl(24 50% 25%)"
        strokeWidth="1"
      />
      {/* Spots */}
      <circle cx="52" cy="104" r="3" fill="hsl(24 50% 30%)" />
      <circle cx="64" cy="114" r="2.5" fill="hsl(24 50% 30%)" />
      <circle cx="76" cy="106" r="2" fill="hsl(24 50% 30%)" />
      <circle cx="70" cy="122" r="2.5" fill="hsl(24 50% 30%)" />
      {/* Long neck curving back */}
      <path
        d="M 76 88 Q 78 72 72 56 Q 68 42 76 32"
        stroke="hsl(24 65% 55%)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Head */}
      <ellipse cx="78" cy="28" rx="6" ry="4" fill="hsl(36 70% 65%)" stroke="hsl(24 50% 25%)" strokeWidth="0.8" />
      <circle cx="80" cy="27" r="0.8" fill="hsl(232 40% 15%)" />
      {/* Horns */}
      <line x1="76" y1="24" x2="75" y2="20" stroke="hsl(24 50% 25%)" strokeWidth="1" />
      <line x1="79" y1="24" x2="80" y2="20" stroke="hsl(24 50% 25%)" strokeWidth="1" />
      {/* Legs */}
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
      {/* Melting head */}
      <path
        d="M 40 10 Q 28 14 30 30 Q 26 50 34 62 Q 44 70 56 62 Q 64 48 60 30 Q 58 14 48 10 Q 44 8 40 10 Z"
        fill="url(#melt-body)"
        stroke="hsl(232 40% 20%)"
        strokeWidth="0.8"
      />
      {/* Drooping body */}
      <path
        d="M 36 62 Q 30 120 42 180 Q 46 220 44 250 Q 50 254 56 250 Q 58 220 62 180 Q 72 120 62 62 Z"
        fill="url(#melt-body)"
        stroke="hsl(232 40% 20%)"
        strokeWidth="0.8"
        opacity="0.85"
      />
      {/* Eye */}
      <circle cx="44" cy="32" r="1.5" fill="#0b0b14" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Swan-Elephant                                   */
/* -------------------------------------------------------------------------- */
/* Dalí "Swans Reflecting Elephants" — swan on top, elephant mirror below */

function SwanElephant() {
  return (
    <svg viewBox="0 0 180 140" className="w-full h-auto" fill="none">
      <defs>
        <linearGradient id="swan-g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(248 30% 90%)" />
          <stop offset="100%" stopColor="hsl(248 30% 65%)" />
        </linearGradient>
      </defs>
      {/* Swan body */}
      <path
        d="M 30 60 Q 50 40 90 45 Q 130 48 140 62 Q 130 70 90 68 Q 55 66 30 60 Z"
        fill="url(#swan-g)"
        stroke="hsl(248 35% 30%)"
        strokeWidth="0.8"
      />
      {/* Swan neck */}
      <path
        d="M 130 58 Q 145 40 150 24 Q 152 18 148 16"
        stroke="hsl(248 30% 55%)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* Swan head */}
      <ellipse cx="148" cy="18" rx="5" ry="3" fill="hsl(248 30% 80%)" stroke="hsl(248 35% 30%)" strokeWidth="0.6" />
      <circle cx="150" cy="17" r="0.6" fill="hsl(232 40% 15%)" />
      <path d="M 152 18 L 157 18" stroke="hsl(24 80% 55%)" strokeWidth="1.2" strokeLinecap="round" />
      {/* Waterline */}
      <line x1="10" y1="72" x2="170" y2="72" stroke="hsl(232 40% 40%)" strokeWidth="0.5" opacity="0.5" strokeDasharray="3 2" />
      {/* Reflection — becomes elephant */}
      <g transform="translate(0, 144) scale(1, -1)" opacity="0.55">
        <path
          d="M 30 60 Q 50 40 90 45 Q 130 48 140 62 Q 130 70 90 68 Q 55 66 30 60 Z"
          fill="hsl(232 35% 45%)"
          stroke="hsl(232 40% 25%)"
          strokeWidth="0.6"
        />
        {/* Elephant trunk (formed from swan's neck) */}
        <path
          d="M 130 58 Q 145 40 150 24"
          stroke="hsl(232 35% 40%)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        {/* Elephant ear (from swan body back) */}
        <path d="M 50 55 Q 40 50 45 60 Z" fill="hsl(232 30% 35%)" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Surreal Eye                                  */
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
      </defs>
      <path
        d="M 10 40 Q 70 -10 130 40 Q 70 90 10 40 Z"
        fill="#ffffff"
        stroke="hsl(232 40% 20%)"
        strokeWidth="1.5"
        opacity="0.85"
      />
      <circle cx="70" cy="40" r="16" fill="url(#iris-grad)" />
      <circle cx="70" cy="40" r="6" fill="#0b0b14" />
      <circle cx="66" cy="36" r="2" fill="#ffffff" opacity="0.9" />
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
}: {
  style: React.CSSProperties;
  className?: string;
  color: string;
  shadowTilt: number;
}) {
  return (
    <div className={`absolute ${className} float-drift-slow`} style={style}>
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
  );
}

/* -------------------------------------------------------------------------- */
/*                         Ladder to nowhere                                   */
/* -------------------------------------------------------------------------- */

function Ladder() {
  return (
    <svg
      className="absolute hidden lg:block"
      style={{
        top: "30%",
        left: "58%",
        width: "min(60px, 5vw)",
        opacity: 0.45,
        transform: "rotate(4deg)",
      }}
      viewBox="0 0 60 320"
      fill="none"
    >
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
/* Another Dalí obsession — ants signaling decay/time.                        */

function Ants() {
  return (
    <>
      <div
        className="absolute hidden md:block ant-crawl"
        style={{ top: "82%", left: "18%", animationDelay: "0s" }}
      >
        <Ant />
      </div>
      <div
        className="absolute hidden md:block ant-crawl"
        style={{ top: "86%", left: "30%", animationDelay: "-3s" }}
      >
        <Ant />
      </div>
      <div
        className="absolute hidden lg:block ant-crawl"
        style={{ top: "90%", left: "52%", animationDelay: "-7s" }}
      >
        <Ant />
      </div>
      <div
        className="absolute hidden lg:block ant-crawl"
        style={{ top: "84%", left: "68%", animationDelay: "-10s" }}
      >
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
      {/* legs */}
      <line x1="6" y1="10" x2="3" y2="4" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="6" y1="10" x2="3" y2="17" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="14" y1="10" x2="14" y2="3" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="14" y1="10" x2="14" y2="18" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="22" y1="10" x2="26" y2="3" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      <line x1="22" y1="10" x2="26" y2="17" stroke="hsl(232 40% 15%)" strokeWidth="0.6" />
      {/* antennae */}
      <line x1="2" y1="9" x2="-2" y2="5" stroke="hsl(232 40% 15%)" strokeWidth="0.5" />
      <line x1="2" y1="11" x2="-2" y2="15" stroke="hsl(232 40% 15%)" strokeWidth="0.5" />
    </svg>
  );
}
