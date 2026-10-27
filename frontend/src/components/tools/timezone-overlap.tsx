"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { COMMON_ZONES, isValidZone, zoneAbbr } from "@/lib/availability-share";
import { NumberField, Panel } from "./ui";

/** Offset of a zone from UTC, in hours, on a given day. */
function offsetHours(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return (asUtc - at.getTime()) / 3_600_000;
}

function clock(h: number): string {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.round((x - hh) * 60);
  const ap = hh < 12 ? "AM" : "PM";
  const h12 = ((hh + 11) % 12) + 1;
  return mm ? `${h12}:${String(mm).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}

/** Working hours several time zones share, drawn on one 24-hour strip. */
export function TimezoneOverlapCalculator() {
  const [zones, setZones] = useState<string[]>(["America/New_York", "America/Los_Angeles", "Europe/London"]);
  const [start, setStart] = useState(9);
  const [end, setEnd] = useState(17);
  const [custom, setCustom] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Read the clock after hydration so the server and browser agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
  }, []);

  const atMs = now ? now.getTime() : Date.UTC(2026, 10, 4, 12);
  const at = useMemo(() => new Date(atMs), [atMs]);
  const base = zones[0];
  const offsets = useMemo(() => zones.map((z) => offsetHours(z, at)), [zones, at]);

  // Each zone's working window, expressed in the first zone's hours.
  const windows = zones.map((_, i) => {
    const shift = offsets[0] - offsets[i];
    return [start + shift, end + shift] as const;
  });
  const lo = Math.max(...windows.map((w) => w[0]));
  const hi = Math.min(...windows.map((w) => w[1]));
  const overlap = hi > lo ? hi - lo : 0;

  function add(zone: string) {
    if (!zone || zones.includes(zone) || !isValidZone(zone)) return;
    setZones([...zones, zone]);
    setCustom("");
  }

  const strip = (from: number, to: number) => {
    // The strip spans the first zone's day; parts outside wrap around.
    const segs: [number, number][] = [];
    for (const k of [-24, 0, 24]) {
      const a = Math.max(from + k, 0);
      const b = Math.min(to + k, 24);
      if (b > a) segs.push([a, b]);
    }
    return segs;
  };

  return (
    <Panel>
      <div className="flex flex-wrap gap-2">
        {zones.map((z, i) => (
          <span key={z} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm">
            <span className="font-medium">{zoneAbbr(z, at)}</span>
            <span className="text-muted-foreground">{z.replace(/_/g, " ")}</span>
            {zones.length > 2 && (
              <button type="button" aria-label={`Remove ${z}`} onClick={() => setZones(zones.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value="" onChange={(e) => add(e.target.value)} aria-label="Add a time zone">
          <option value="">Add a time zone…</option>
          {COMMON_ZONES.filter((z) => !zones.includes(z.zone)).map((z) => (
            <option key={z.zone} value={z.zone}>{z.label} ({zoneAbbr(z.zone, at)})</option>
          ))}
        </select>
        <input
          className="h-9 w-48 rounded-md border bg-background px-2 text-sm"
          placeholder="Other, e.g. Asia/Singapore"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(custom.trim())}
        />
      </div>
      <div className="mt-5 grid max-w-sm grid-cols-2 gap-4">
        <NumberField label="Workday starts" suffix=":00" value={start} onChange={(n) => setStart(Math.min(Math.max(n, 0), 23))} />
        <NumberField label="Workday ends" suffix=":00" value={end} onChange={(n) => setEnd(Math.min(Math.max(n, 1), 24))} />
      </div>

      <div className="mt-6 space-y-2">
        {zones.map((z, i) => (
          <div key={z} className="grid grid-cols-[64px_1fr] items-center gap-3">
            <span className="text-sm font-medium">{zoneAbbr(z, at)}</span>
            <div className="relative h-7 overflow-hidden rounded-md bg-muted">
              {strip(windows[i][0], windows[i][1]).map(([a, b]) => (
                <div key={a} className="absolute inset-y-0 bg-[hsl(var(--aurora-1)/0.35)]" style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%` }} />
              ))}
              {overlap > 0 &&
                strip(lo, hi).map(([a, b]) => (
                  <div key={"o" + a} className="absolute inset-y-0 bg-[hsl(var(--aurora-4)/0.85)]" style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%` }} />
                ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[64px_1fr] gap-3 text-[11px] text-muted-foreground">
          <span />
          <div className="flex justify-between"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Hours shown on {zoneAbbr(base, at)} time. Purple is each place&apos;s workday; blue is the overlap.</p>
      </div>

      <div className="mt-6 rounded-xl border bg-background/70 p-4">
        {overlap > 0 ? (
          <>
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Shared working hours</div>
            <div className="mt-1 text-2xl font-semibold">
              {Math.round(overlap * 10) / 10} hour{Math.round(overlap * 10) / 10 === 1 ? "" : "s"} a day
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {zones.map((z, i) => {
                const shift = offsets[i] - offsets[0];
                return (
                  <li key={z} className="tabular-nums">
                    <span className="font-medium">{zoneAbbr(z, at)}:</span> {clock(lo + shift)}–{clock(hi + shift)}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="text-sm">
            <span className="font-semibold">No shared working hours.</span> Someone has to start early or stay late. Try widening the workday above.
          </div>
        )}
      </div>
    </Panel>
  );
}
