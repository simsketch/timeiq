import { cn } from "@/lib/utils";

interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-9 h-9", className)}
    >
      <defs>
        <linearGradient
          id="logo-bg"
          x1="2"
          y1="2"
          x2="38"
          y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="hsl(280 80% 64%)" />
          <stop offset="50%" stopColor="hsl(248 82% 62%)" />
          <stop offset="100%" stopColor="hsl(192 90% 58%)" />
        </linearGradient>
        <linearGradient
          id="logo-shine"
          x1="4"
          y1="4"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="logo-inner" cx="0.5" cy="0.35" r="0.65">
          <stop offset="0%" stopColor="white" stopOpacity="0.28" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="logo-face"
          x1="12"
          y1="10"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="white" stopOpacity="0.95" />
          <stop offset="100%" stopColor="white" stopOpacity="0.78" />
        </linearGradient>
      </defs>

      {/* Base aurora rounded square */}
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#logo-bg)" />
      {/* Top-left specular shine */}
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#logo-shine)" />
      {/* Ambient inner glow */}
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#logo-inner)" />
      {/* Thin top highlight */}
      <path
        d="M11 3.5 H29 a7.5 7.5 0 0 1 7.5 7.5"
        stroke="white"
        strokeOpacity="0.42"
        strokeWidth="0.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Clock face (glass disc) */}
      <circle cx="20" cy="20.5" r="9.5" fill="url(#logo-face)" />
      <circle
        cx="20"
        cy="20.5"
        r="9.5"
        stroke="white"
        strokeOpacity="0.65"
        strokeWidth="0.6"
      />

      {/* Tick marks at 12 / 3 / 6 / 9 */}
      <circle cx="20" cy="12.5" r="0.9" fill="hsl(248 82% 55%)" />
      <circle cx="28" cy="20.5" r="0.65" fill="hsl(248 82% 55%)" fillOpacity="0.7" />
      <circle cx="20" cy="28.5" r="0.65" fill="hsl(248 82% 55%)" fillOpacity="0.7" />
      <circle cx="12" cy="20.5" r="0.65" fill="hsl(248 82% 55%)" fillOpacity="0.7" />

      {/* Hour hand */}
      <line
        x1="20"
        y1="20.5"
        x2="16.5"
        y2="17"
        stroke="hsl(232 40% 18%)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Minute hand */}
      <line
        x1="20"
        y1="20.5"
        x2="24.8"
        y2="15.8"
        stroke="hsl(248 82% 55%)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Center pivot */}
      <circle cx="20" cy="20.5" r="1.5" fill="white" />
      <circle cx="20" cy="20.5" r="1.5" stroke="hsl(248 82% 55%)" strokeWidth="0.5" />
      <circle cx="20" cy="20.5" r="0.55" fill="hsl(248 82% 55%)" />
    </svg>
  );
}
