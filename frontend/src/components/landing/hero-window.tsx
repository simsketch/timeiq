import { CalendarDays, Clock, Home, Inbox, Users } from "lucide-react";
import { LogoIcon } from "@/components/logo";

// A still of the Bookings week, rising out of the bottom of the hero. Static
// markup with no JS. Following stageshow's dark-hero rules: the window is one
// step lighter than the page and its chrome one step lighter again, with a
// hairline on top; one colour is lit (the booking that was just made); real
// words only on that booking and the screen's own labels, bars elsewhere.

const HOUR = 56;
const START = 8; // 8 AM at the top of the grid

// [day, start hour, length in hours]
const SYNCED: [number, number, number][] = [
  [0, 9.5, 1],
  [0, 12, 0.75],
  [1, 11, 1],
  [2, 8.5, 1],
  [2, 12, 1],
  [3, 9.5, 1.5],
  [4, 8.5, 0.5],
  [4, 11, 1],
];
const FOCAL = { day: 1, start: 9, len: 0.5 };
const DAYS = ["Mon 2", "Tue 3", "Wed 4", "Thu 5", "Fri 6"];

function Bar({ w, className = "" }: { w: string; className?: string }) {
  return <span className={`block h-1.5 rounded-full bg-white/15 ${className}`} style={{ width: w }} />;
}

export function HeroWindow() {
  return (
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-[1100px] rounded-t-2xl border border-b-0 border-white/10 bg-[hsl(258_30%_8%)] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
    >
      {/* Chrome */}
      <div className="flex items-center gap-2 rounded-t-2xl border-b border-white/[0.07] bg-[hsl(258_24%_11%)] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="mx-auto rounded-md bg-white/[0.06] px-6 py-1 text-[11px] text-white/45">timeiq.app/bookings</span>
        <span className="w-[46px]" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden md:block w-48 shrink-0 border-r border-white/[0.07] p-4 space-y-1">
          <div className="flex items-center gap-2 px-2 pb-4 [&_svg]:h-6 [&_svg]:w-6">
            <LogoIcon />
            <span className="text-sm font-semibold text-white/90">TimeIQ</span>
          </div>
          {[Home, CalendarDays, Clock, Users, Inbox].map((Icon, i) =>
            i === 1 ? (
              <div key={i} className="flex items-center gap-2.5 rounded-lg bg-white/[0.07] px-2 py-2 text-[13px] text-white">
                <Icon className="h-4 w-4 text-white/80" />
                Bookings
              </div>
            ) : (
              <div key={i} className="flex items-center gap-2.5 px-2 py-2">
                <Icon className="h-4 w-4 text-white/30" />
                <Bar w={["52px", "", "64px", "48px", "58px"][i]} />
              </div>
            ),
          )}
        </div>

        {/* Week */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-lg font-semibold text-white">Bookings</div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex gap-0.5 rounded-lg bg-white/[0.05] p-0.5 text-xs">
                <span className="rounded-md px-2.5 py-1 text-white/40">Day</span>
                <span className="rounded-md bg-white/10 px-2.5 py-1 text-white">Week</span>
                <span className="rounded-md px-2.5 py-1 text-white/40">Month</span>
              </span>
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-[hsl(258_30%_10%)]">New booking</span>
            </div>
          </div>

          <div className="grid grid-cols-[40px_repeat(3,1fr)] sm:grid-cols-[44px_repeat(5,1fr)] text-[11px]">
            <span />
            {DAYS.map((d, i) => (
              <span key={d} className={`pb-2 pl-2 text-white/40 ${i > 2 ? "hidden sm:block" : ""}`}>{d}</span>
            ))}

            <div className="relative" style={{ height: HOUR * 6 }}>
              {[8, 9, 10, 11, 12, 1].map((h, i) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-white/25" style={{ top: i * HOUR }}>
                  {h} {h >= 8 && h < 12 ? "AM" : "PM"}
                </span>
              ))}
            </div>
            {DAYS.map((d, day) => (
              <div
                key={d}
                className={`relative border-l border-white/[0.06] bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_56px)] ${day > 2 ? "hidden sm:block" : ""}`}
                style={{ height: HOUR * 6 }}
              >
                {SYNCED.filter(([d2]) => d2 === day).map(([, start, len]) => (
                  <div
                    key={start}
                    className="absolute inset-x-1 rounded-md bg-white/[0.05] p-2"
                    style={{ top: (start - START) * HOUR + 1, height: len * HOUR - 3 }}
                  >
                    <Bar w="62%" />
                  </div>
                ))}
                {day === FOCAL.day && (
                  <div
                    className="absolute inset-x-1 rounded-md border-l-2 border-[hsl(var(--brand))] bg-[hsl(var(--brand)/0.28)] px-2 py-1 leading-tight"
                    style={{ top: (FOCAL.start - START) * HOUR + 1, minHeight: FOCAL.len * HOUR + 18 }}
                  >
                    <div className="truncate font-medium text-white">Intro call · Aghil</div>
                    <div className="truncate text-white/70">9:00 – 9:30 AM</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
