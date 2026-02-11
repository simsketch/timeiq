import { cn } from "@/lib/utils";

interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-9 h-9", className)}
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-bg)" />
      <circle cx="16" cy="17" r="9" stroke="white" strokeWidth="1.8" fill="none" strokeOpacity="0.9" />
      <line x1="16" y1="17" x2="12.5" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.95" />
      <line x1="16" y1="17" x2="21" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.9" />
      <circle cx="16" cy="17" r="1.5" fill="white" />
      <line x1="16" y1="9.5" x2="16" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}
