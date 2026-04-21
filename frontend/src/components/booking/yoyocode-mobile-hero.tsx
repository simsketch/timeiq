"use client";

import { Clock } from "lucide-react";

interface PlaygroundEventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  color: string;
}

interface Props {
  eventTypes: PlaygroundEventType[];
}

export function YoyoCodeMobileHero({ eventTypes }: Props) {
  const chips = eventTypes.slice(0, 3);
  return (
    <div className="relative h-[320px] w-full flex items-center justify-center">
      {/* Aurora halo */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[3rem] blur-3xl opacity-80"
        style={{
          background:
            "radial-gradient(45% 45% at 30% 35%, hsl(var(--aurora-5) / 0.55), transparent 70%), radial-gradient(45% 45% at 70% 55%, hsl(var(--aurora-4) / 0.5), transparent 70%), radial-gradient(40% 40% at 55% 80%, hsl(var(--aurora-2) / 0.4), transparent 70%)",
        }}
      />

      {/* Floating glass clock centerpiece */}
      <div
        className="relative hero-float"
        style={{ perspective: "800px" }}
      >
        <div
          className="relative rounded-full glass flex items-center justify-center"
          style={{
            width: 180,
            height: 180,
            transform: "rotateX(55deg) rotateZ(-12deg)",
            boxShadow:
              "0 20px 50px -10px hsl(var(--aurora-1) / 0.45), 0 0 0 1px hsl(var(--aurora-1) / 0.15), inset 0 2px 4px rgba(255,255,255,0.5)",
          }}
        >
          {/* Face rings */}
          <div className="absolute inset-5 rounded-full border border-[hsl(var(--aurora-1))]/20" />
          <div className="absolute inset-10 rounded-full border border-[hsl(var(--aurora-1))]/15" />
          {/* Center pivot + hands (rendered as 2D inside tilted plane) */}
          <svg viewBox="0 0 180 180" className="relative w-full h-full">
            {/* 12/3/6/9 tick dots */}
            <circle cx="90" cy="22" r="3.5" fill="hsl(248 82% 55%)" />
            <circle cx="158" cy="90" r="2.5" fill="hsl(248 82% 55%)" opacity="0.7" />
            <circle cx="90" cy="158" r="2.5" fill="hsl(248 82% 55%)" opacity="0.7" />
            <circle cx="22" cy="90" r="2.5" fill="hsl(248 82% 55%)" opacity="0.7" />
            {/* Hour hand */}
            <line
              x1="90"
              y1="90"
              x2="65"
              y2="65"
              stroke="hsl(232 40% 18%)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Minute hand */}
            <line
              x1="90"
              y1="90"
              x2="126"
              y2="55"
              stroke="hsl(248 82% 55%)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Center */}
            <circle cx="90" cy="90" r="6" fill="white" stroke="hsl(248 82% 55%)" strokeWidth="1.5" />
            <circle cx="90" cy="90" r="2" fill="hsl(248 82% 55%)" />
          </svg>
        </div>
      </div>

      {/* Floating chips */}
      {chips.map((event, i) => {
        const positions = [
          { top: "12%", left: "4%", className: "hero-float-chip" },
          { top: "18%", right: "4%", className: "hero-float-pill" },
          { bottom: "10%", left: "10%", className: "hero-float-chip" },
        ];
        const pos = positions[i];
        return (
          <div
            key={event.id}
            className={`absolute ${pos.className}`}
            style={pos}
          >
            <div className="relative glass rounded-2xl px-4 py-2.5 shadow-[0_12px_30px_-10px_rgba(17,18,35,0.2)]">
              <div
                aria-hidden
                className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full"
                style={{ backgroundColor: event.color }}
              />
              <div className="pl-2.5">
                <div className="font-display text-sm tracking-[-0.01em] leading-tight">
                  {event.name}
                </div>
                <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {event.duration_minutes} min
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
