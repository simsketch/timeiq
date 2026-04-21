import { cn } from "@/lib/utils";

interface ClockLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  fullscreen?: boolean;
}

const SIZE_MAP = {
  sm: 32,
  md: 56,
  lg: 88,
} as const;

export function ClockLoader({
  className,
  size = "md",
  label,
  fullscreen = false,
}: ClockLoaderProps) {
  const dim = SIZE_MAP[size];

  const clock = (
    <div
      className={cn(
        "relative inline-flex flex-col items-center gap-4",
        className
      )}
      role="status"
      aria-label={label ?? "Loading"}
    >
      <div className="relative" style={{ width: dim, height: dim }}>
        {/* Soft pulsing aurora halo */}
        <div
          className="absolute -inset-4 rounded-full blur-2xl animate-[halo-breathe_3.2s_ease-in-out_infinite] opacity-80"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--aurora-1) / 0.55), hsl(var(--aurora-4) / 0.25) 55%, transparent 75%)",
          }}
          aria-hidden
        />
        <svg
          width={dim}
          height={dim}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative block"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="cl-ring"
              x1="6"
              y1="6"
              x2="58"
              y2="58"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="hsl(280 80% 64%)" />
              <stop offset="50%" stopColor="hsl(248 82% 62%)" />
              <stop offset="100%" stopColor="hsl(192 90% 58%)" />
            </linearGradient>
            <linearGradient
              id="cl-face"
              x1="18"
              y1="12"
              x2="46"
              y2="52"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="hsl(0 0% 100% / 0.95)" />
              <stop offset="100%" stopColor="hsl(232 40% 96%)" />
            </linearGradient>
            <linearGradient
              id="cl-hand-minute"
              x1="32"
              y1="15"
              x2="32"
              y2="34"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="hsl(280 80% 58%)" />
              <stop offset="100%" stopColor="hsl(248 82% 58%)" />
            </linearGradient>
            <linearGradient
              id="cl-hand-hour"
              x1="32"
              y1="22"
              x2="32"
              y2="34"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="hsl(248 82% 55%)" />
              <stop offset="100%" stopColor="hsl(232 40% 18%)" />
            </linearGradient>
            <radialGradient id="cl-shine" cx="0.42" cy="0.3" r="0.55">
              <stop offset="0%" stopColor="white" stopOpacity="0.7" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Aurora outer bezel */}
          <circle cx="32" cy="32" r="28" fill="url(#cl-ring)" />
          {/* Face */}
          <circle cx="32" cy="32" r="25" fill="url(#cl-face)" />
          {/* Top specular highlight */}
          <circle cx="32" cy="32" r="25" fill="url(#cl-shine)" />
          {/* Inner subtle ring */}
          <circle
            cx="32"
            cy="32"
            r="22"
            stroke="hsl(248 82% 62% / 0.12)"
            strokeWidth="1"
            fill="none"
          />

          {/* Minute tick marks — 12 positions */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const isMajor = i % 3 === 0;
            const outer = 25;
            const inner = isMajor ? 21 : 23;
            const x1 = 32 + Math.sin(angle) * outer;
            const y1 = 32 - Math.cos(angle) * outer;
            const x2 = 32 + Math.sin(angle) * inner;
            const y2 = 32 - Math.cos(angle) * inner;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  isMajor ? "hsl(232 40% 18% / 0.55)" : "hsl(232 40% 18% / 0.2)"
                }
                strokeWidth={isMajor ? 1.25 : 0.75}
                strokeLinecap="round"
              />
            );
          })}

          {/* Hour hand */}
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="22"
            stroke="url(#cl-hand-hour)"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 32 32"
              to="360 32 32"
              dur="9s"
              repeatCount="indefinite"
            />
          </line>

          {/* Minute hand */}
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="14"
            stroke="url(#cl-hand-minute)"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 32 32"
              to="360 32 32"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </line>

          {/* Second hand accent */}
          <g>
            <line
              x1="32"
              y1="34"
              x2="32"
              y2="12"
              stroke="hsl(24 94% 58%)"
              strokeWidth="0.85"
              strokeLinecap="round"
              opacity="0.75"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 32 32"
                to="360 32 32"
                dur="0.9s"
                repeatCount="indefinite"
              />
            </line>
          </g>

          {/* Center pivot */}
          <circle cx="32" cy="32" r="3" fill="white" />
          <circle
            cx="32"
            cy="32"
            r="3"
            stroke="hsl(248 82% 62%)"
            strokeWidth="0.75"
            fill="none"
          />
          <circle cx="32" cy="32" r="1.1" fill="hsl(248 82% 62%)" />
        </svg>
      </div>
      {label && (
        <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
          {label}
        </p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        <div className="aurora-bg aurora-bg-soft" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative">{clock}</div>
      </div>
    );
  }

  return clock;
}
