import { cn } from "@/lib/utils";

// The TimeIQ mark: a ring with a notch (a Q, and a speech bubble) and a tangerine
// full stop. Geometry comes from brand/build.py; regenerate the paths there.
export const MARK_RING =
  "M69.691 69.962 A31.5 31.5 0 1 1 69.962 69.691 L65.900 60.578 A22.5 22.5 0 1 0 60.578 65.900 Z";
export const MARK_DOT = { cx: 77.747, cy: 77.747, r: 6.2 };

interface LogoIconProps {
  className?: string;
}

/** The app-icon tile: graphite rounded square with the cream mark. */
export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-9 h-9", className)}
      aria-hidden="true"
    >
      <rect width="100" height="100" rx="24" fill="#141414" />
      <g transform="translate(10 10) scale(0.8)">
        <path d={MARK_RING} fill="#F4EFE3" />
        <circle {...MARK_DOT} fill="#F2690D" />
      </g>
    </svg>
  );
}

/** The bare mark in the current text colour, with the tangerine full stop. */
export function LogoMark({ className }: LogoIconProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("w-6 h-6", className)} aria-hidden="true">
      <path d={MARK_RING} fill="currentColor" />
      <circle {...MARK_DOT} fill="#F2690D" />
    </svg>
  );
}
