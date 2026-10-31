"use client";

import { DAY_LABELS, dayDate, clock, type DemoEvent } from "./demo-week";

interface Props {
  days: number;
  from: number;
  to: number;
  events: DemoEvent[];
  /** Ids drawn with the drop-in animation. */
  fresh?: Set<string>;
  /** Open stretches to tint green, per day. */
  free?: { day: number; start: number; end: number }[];
  hourHeight?: number;
  /** Keep the all-day row even when it's empty, so adding an all-day event doesn't shift the page. */
  reserveAllDay?: boolean;
}

/** A compact, read-only week grid for the homepage demos. */
export function MiniWeek({ days, from, to, events, fresh, free = [], hourHeight = 22, reserveAllDay = false }: Props) {
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = (to - from) * hourHeight;
  const pos = (start: number, end: number) => ({
    top: `${((Math.max(start, from) - from) / (to - from)) * 100}%`,
    height: `${((Math.min(end, to) - Math.max(start, from)) / (to - from)) * 100}%`,
  });
  const allDay = events.filter((e) => e.allDay);
  // Fresh events drop in one after another, in the order they were added.
  const order = fresh ? Array.from(fresh) : [];
  const delay = (id: string) => (fresh?.has(id) ? { animationDelay: `${order.indexOf(id) * 140}ms` } : {});

  return (
    <div className="text-[10px]">
      <div className="grid" style={{ gridTemplateColumns: `2.25rem repeat(${days}, minmax(0, 1fr))` }}>
        <div />
        {Array.from({ length: days }, (_, d) => (
          <div key={d} className="pb-1.5 text-center font-mono uppercase tracking-wider text-muted-foreground">
            <span className="hidden sm:inline">{dayDate(d)}</span>
            <span className="sm:hidden">{DAY_LABELS[d].slice(0, 2)}</span>
          </div>
        ))}
        {(reserveAllDay || allDay.length > 0) && (
          <>
            <div className="pr-1 text-right font-mono text-muted-foreground/70 leading-5">all</div>
            {Array.from({ length: days }, (_, d) => (
              <div key={d} className="px-0.5 pb-1 min-h-5">
                {allDay
                  .filter((e) => e.day === d)
                  .map((e) => (
                    <div
                      key={e.id}
                      className={`truncate rounded px-1 leading-5 text-white font-medium ${fresh?.has(e.id) ? "demo-drop" : ""}`}
                      style={{ background: e.color, ...delay(e.id) }}
                    >
                      {e.title}
                    </div>
                  ))}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `2.25rem repeat(${days}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute right-1 -translate-y-1/2 font-mono text-muted-foreground/70 tabular-nums"
              style={{ top: `${(i / (to - from)) * 100}%` }}
            >
              {i === 0 ? "" : clock(h).replace(":00", "").replace(" ", "")}
            </div>
          ))}
        </div>
        {Array.from({ length: days }, (_, d) => (
          <div key={d} className="relative border-l border-foreground/[0.06]" style={{ height }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-foreground/[0.05]"
                style={{ top: `${(i / (to - from)) * 100}%` }}
              />
            ))}
            {free
              .filter((f) => f.day === d)
              .map((f) => (
                // A window that changes shape remounts and fades in; sliding top/height would shift layout.
                <div
                  key={`${f.start}-${f.end}`}
                  className="demo-fade absolute inset-x-0.5 rounded bg-emerald-400/20 ring-1 ring-inset ring-emerald-500/30"
                  style={pos(f.start, f.end)}
                />
              ))}
            {events
              .filter((e) => e.day === d && !e.allDay && e.end > from && e.start < to)
              .map((e) => (
                <div
                  key={e.id}
                  title={`${e.title} · ${clock(e.start)}–${clock(e.end)}`}
                  className={`absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 leading-tight text-white font-medium shadow-sm ${
                    fresh?.has(e.id) ? "demo-drop" : ""
                  }`}
                  style={{ ...pos(e.start, e.end), background: e.color, ...delay(e.id) }}
                >
                  <span className="line-clamp-2">{e.title}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
