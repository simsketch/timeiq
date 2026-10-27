"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { MiniWeek } from "./mini-week";
import {
  DAY_LABELS,
  DEMO_CALENDARS,
  MERGE_EVENTS,
  clock,
  dayDate,
  freeWindows,
  slotsFor,
  type CalendarKey,
} from "./demo-week";

const WEEKDAYS = [0, 1, 2, 3, 4];
const ALL_EVENTS = Object.values(MERGE_EVENTS).flat();
const SAFE_SLOTS = WEEKDAYS.reduce((n, d) => n + slotsFor(d, ALL_EVENTS).length, 0);

/** Toggle calendars and watch the booking page's open slots follow. */
export function CalendarMergeDemo() {
  const [on, setOn] = useState<Set<CalendarKey>>(new Set(["work"]));
  const [justAdded, setJustAdded] = useState<CalendarKey | null>(null);
  const [day, setDay] = useState(1);

  const busy = DEMO_CALENDARS.filter((c) => on.has(c.key)).flatMap((c) => MERGE_EVENTS[c.key]);
  const offered = WEEKDAYS.reduce((n, d) => n + slotsFor(d, busy).length, 0);
  const clashes = offered - SAFE_SLOTS;
  const free = WEEKDAYS.flatMap((d) => freeWindows(d, busy).map(([start, end]) => ({ day: d, start, end })));
  const daySlots = slotsFor(day, busy);
  const clashing = new Set(daySlots.filter((t) => !slotsFor(day, ALL_EVENTS).includes(t)));
  const fresh = new Set(justAdded ? MERGE_EVENTS[justAdded].map((e) => e.id) : []);

  function toggle(key: CalendarKey) {
    const next = new Set(on);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOn(next);
    setJustAdded(next.has(key) ? key : null);
  }

  return (
    <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      <div className="lg:col-span-4 space-y-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
          Your calendars · tap to connect
        </div>
        {DEMO_CALENDARS.map((c) => {
          const active = on.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => toggle(c.key)}
              className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
                active ? "glass shadow-md" : "bg-white/30 ring-1 ring-foreground/[0.06] hover:bg-white/50"
              }`}
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: c.color, opacity: active ? 1 : 0.35 }} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${active ? "" : "text-foreground/60"}`}>{c.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.source} · {MERGE_EVENTS[c.key].length} events this week
                </span>
              </span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  active ? "bg-[hsl(var(--aurora-1))]" : "bg-foreground/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    active ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          );
        })}

        <div aria-live="polite" className="pt-2">
          {clashes > 0 ? (
            <div className="rounded-2xl bg-amber-50/90 ring-1 ring-amber-500/25 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {clashes} bookable {clashes === 1 ? "slot clashes" : "slots clash"} with a calendar you left out
              </div>
              <p className="mt-1 text-amber-900/80 text-xs leading-relaxed">
                A booking page that only sees some of your calendars will happily book over the dentist.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50/90 ring-1 ring-emerald-500/25 px-4 py-3 text-sm text-emerald-900">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Zero clashes. Guests only see times you&apos;re really free.
              </div>
              <p className="mt-1 text-emerald-900/80 text-xs leading-relaxed">
                Connect as many calendars as you use. There&apos;s no limit and no upgrade.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-8 glass rounded-[1.75rem] p-4 sm:p-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-semibold">Your week</div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400/50 ring-1 ring-emerald-500/40 mr-1" />
            Open to book
          </div>
        </div>
        <MiniWeek days={5} from={9} to={17} events={busy} fresh={fresh} free={free} hourHeight={26} />

        <div className="mt-5 border-t border-foreground/[0.06] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-sm font-semibold">What your booking page offers</div>
            <div className="flex gap-1" role="tablist" aria-label="Day">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={d === day}
                  onClick={() => setDay(d)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    d === day ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/[0.06]"
                  }`}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[64px] content-start">
            {daySlots.map((t) => (
              <span
                key={t}
                className={`rounded-lg px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                  clashing.has(t)
                    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-500/40 line-through decoration-amber-700/60"
                    : "glass text-foreground/80"
                }`}
                title={clashing.has(t) ? "Clashes with a calendar you haven't connected" : undefined}
              >
                {clock(t)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {dayDate(day)}: {daySlots.length - clashing.size} safe 30-minute slots
            {clashing.size > 0 && `, ${clashing.size} that would double-book you`}.
          </p>
        </div>
      </div>
    </div>
  );
}
