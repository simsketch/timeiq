/** Turn open windows into shareable text and a weekly grid image. */

export interface FreeWindow {
  start: string;
  end: string;
}

export interface FreeDay {
  date: string;
  working: boolean;
  work_start: string | null;
  work_end: string | null;
  windows: FreeWindow[];
}

export interface AvailabilitySummary {
  timezone: string;
  username: string;
  days: FreeDay[];
}

export interface ZoneOption {
  zone: string;
  label: string;
}

export const COMMON_ZONES: ZoneOption[] = [
  { zone: "America/New_York", label: "Eastern" },
  { zone: "America/Chicago", label: "Central" },
  { zone: "America/Denver", label: "Mountain" },
  { zone: "America/Phoenix", label: "Arizona" },
  { zone: "America/Los_Angeles", label: "Pacific" },
  { zone: "America/Anchorage", label: "Alaska" },
  { zone: "Pacific/Honolulu", label: "Hawaii" },
  { zone: "UTC", label: "UTC" },
  { zone: "Europe/London", label: "London" },
  { zone: "Europe/Berlin", label: "Central Europe" },
  { zone: "Asia/Kolkata", label: "India" },
  { zone: "Asia/Tokyo", label: "Tokyo" },
  { zone: "Australia/Sydney", label: "Sydney" },
];

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Short name for a zone at a given moment, e.g. "EST", "PDT", "GMT+1". */
export function zoneAbbr(zone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? zone;
}

function timeRange(start: Date, end: Date, zone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
  return fmt
    .formatRange(start, end)
    .replace(/[\u202f\u2009]/g, " ")
    .replace(/:00(?=\s|–|$)/g, "")
    .replace(/\s*–\s*/, "–");
}

/** Like timeRange, but a block ending at midnight reads "11 PM–12 AM" with no dates. */
function blockRange(start: Date, end: Date, zone: string): string {
  if (dayKey(start, zone) === dayKey(end, zone)) return timeRange(start, end, zone);
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
  const one = (d: Date) => fmt.format(d).replace(/[\u202f\u2009]/g, " ").replace(/:00(?=\s|$)/, "");
  return `${one(start)}–${one(end)}`;
}

function dayKey(d: Date, zone: string): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}

export interface DayGroup {
  key: string;
  label: string;
  windows: { start: Date; end: Date }[];
}

/** Minutes a zone is ahead of UTC at a given moment. */
function offsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant a calendar day (YYYY-MM-DD) starts in a zone. */
function startOfDay(key: string, zone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let t = wall - offsetMinutes(zone, new Date(wall)) * 60_000;
  // A second pass settles days whose offset differs from the UTC-midnight guess.
  t = wall - offsetMinutes(zone, new Date(t)) * 60_000;
  return new Date(t);
}

function nextDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Windows grouped by calendar day in the primary zone (it may differ from the host's).
 * With `splitAtMidnight`, a window that runs past midnight in the primary zone is cut
 * there and the rest lands on the following day, so a grid can draw every hour of it.
 */
export function groupByDay(summary: AvailabilitySummary, primary: string, splitAtMidnight = false): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  if (primary === summary.timezone) {
    for (const d of summary.days) groups.set(d.date, { key: d.date, label: dayLabel(d.date), windows: [] });
  }
  const put = (key: string, start: Date, end: Date) => {
    if (!groups.has(key)) groups.set(key, { key, label: dayLabel(key), windows: [] });
    groups.get(key)!.windows.push({ start, end });
  };
  for (const d of summary.days) {
    for (const w of d.windows) {
      let start = new Date(w.start);
      const end = new Date(w.end);
      let key = dayKey(start, primary);
      if (splitAtMidnight) {
        for (let next = startOfDay(nextDayKey(key), primary); end > next; next = startOfDay(nextDayKey(key), primary)) {
          put(key, start, next);
          start = next;
          key = nextDayKey(key);
        }
      }
      if (end > start) put(key, start, end);
    }
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildText(
  summary: AvailabilitySummary,
  zones: string[],
  bookingUrl: string,
  includeEmptyDays: boolean
): string {
  const [primary, ...others] = zones;
  const groups = groupByDay(summary, primary).filter((g) => includeEmptyDays || g.windows.length);
  // Name zones as of the first opening, so a week after a clock change says EST, not EDT.
  const ref = groups.find((g) => g.windows.length)?.windows[0].start ?? new Date();
  const abbrs = zones.map((z) => zoneAbbr(z, ref)).join(" / ");
  const lines: string[] = [];
  if (!groups.length) {
    lines.push("I'm fully booked for this stretch. Here's my booking link for later dates:");
  } else {
    lines.push(`Here's when I'm free (times in ${abbrs}):`, "");
    for (const g of groups) {
      if (!g.windows.length) {
        lines.push(`${g.label}: no openings`);
        continue;
      }
      lines.push(g.label);
      for (const w of g.windows) {
        const parts = [`${timeRange(w.start, w.end, primary)} ${zoneAbbr(primary, w.start)}`];
        for (const z of others) parts.push(`${timeRange(w.start, w.end, z)} ${zoneAbbr(z, w.start)}`);
        lines.push(`  ${parts.join("  ·  ")}`);
      }
    }
    lines.push("", "Or grab a time directly:");
  }
  lines.push(bookingUrl);
  return lines.join("\n");
}

function hourIn(d: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: zone }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

function hourLabel(h: number): string {
  const hh = ((h + 11) % 12) + 1;
  return `${hh} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/** Draw the weekly grid; returns the canvas so callers can copy or download it. */
export function drawImage(
  canvas: HTMLCanvasElement,
  summary: AvailabilitySummary,
  zones: string[],
  bookingUrl: string
): HTMLCanvasElement {
  const [primary] = zones;
  const groups = groupByDay(summary, primary, true);
  const weeks = Array.from({ length: Math.max(1, Math.ceil(groups.length / 7)) }, (_, i) => groups.slice(i * 7, i * 7 + 7));

  // Vertical range: the span of working hours and openings, in the primary zone.
  let lo = 24;
  let hi = 0;
  for (const g of groups) {
    for (const w of g.windows) {
      lo = Math.min(lo, Math.floor(hourIn(w.start, primary)));
      const endH = hourIn(w.end, primary);
      hi = Math.max(hi, Math.ceil(endH === 0 ? 24 : endH));
    }
  }
  for (const d of summary.days) {
    if (!d.work_start || !d.work_end) continue;
    const ref = new Date(`${d.date}T12:00:00Z`);
    const shift = hourIn(ref, primary) - hourIn(ref, summary.timezone);
    lo = Math.min(lo, Math.floor(Number(d.work_start.slice(0, 2)) + shift));
    hi = Math.max(hi, Math.ceil(Number(d.work_end.slice(0, 2)) + Number(d.work_end.slice(3)) / 60 + shift));
  }
  if (lo >= hi) [lo, hi] = [9, 17];
  lo = Math.max(0, lo);
  hi = Math.min(24, hi);

  const scale = 2;
  const W = 1200;
  const left = 64;
  const top = 132;
  const bottom = 70;
  // Even a half-hour opening needs one readable line for every selected zone.
  const rowH = Math.max(44, zones.length * 32 + 24);
  const weekH = (hi - lo) * rowH;
  const weekGap = 64;
  const H = top + weeks.length * weekH + (weeks.length - 1) * weekGap + bottom;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const font = (w: number, s: number) => `${w} ${s}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0f172a";
  ctx.font = font(700, 26);
  ctx.fillText("When I'm free", left, 48);
  ctx.fillStyle = "#475569";
  ctx.font = font(400, 15);
  ctx.fillText(`Each opening shows ${zones.map((z) => z.replace(/_/g, " ")).join(" / ")}.`, left, 74, W - left - 24);

  weeks.forEach((week, weekIndex) => {
    const gridTop = top + weekIndex * (weekH + weekGap);
    const colW = (W - left - 24) / Math.max(week.length, 1);

    // Keep long ranges in rows of at most seven days, so labels remain readable.
    week.forEach((g, i) => {
      const x = left + i * colW;
      const ref = g.windows[0]?.start ?? new Date(startOfDay(g.key, primary).getTime() + 12 * 3_600_000);
      ctx.fillStyle = "#0f172a";
      ctx.font = font(600, 15);
      ctx.fillText(g.label, x + 8, gridTop - 30, colW - 16);
      ctx.fillStyle = "#64748b";
      ctx.font = font(500, 12);
      ctx.fillText(zoneAbbr(primary, ref), x + 8, gridTop - 12, colW - 16);
    });

    ctx.font = font(400, 12);
    for (let h = lo; h <= hi; h++) {
      const y = gridTop + (h - lo) * rowH;
      ctx.strokeStyle = h === lo || h === hi ? "#cbd5e1" : "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(W - 24, y);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText(hourLabel(h), 8, y + 4);
    }

    week.forEach((g, i) => {
      const x = left + i * colW + 4;
      for (const w of g.windows) {
        const s = hourIn(w.start, primary);
        let e = hourIn(w.end, primary);
        if (e <= s) e = 24;
        const y1 = gridTop + (Math.max(s, lo) - lo) * rowH;
        const y2 = gridTop + (Math.min(e, hi) - lo) * rowH;
        ctx.fillStyle = "#d1fae5";
        ctx.strokeStyle = "#10b981";
        ctx.beginPath();
        ctx.roundRect(x, y1 + 2, colW - 8, Math.max(y2 - y1 - 4, 6), 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#065f46";
        ctx.font = font(600, 12);
        zones.forEach((zone, index) => {
          // A converted time can fall on another date; name it instead of implying the column's date.
          const localDay = dayKey(w.start, zone);
          const date = localDay === g.key ? "" : `${dayLabel(localDay)}: `;
          ctx.fillText(`${zoneAbbr(zone, w.start)} ${date}${blockRange(w.start, w.end, zone)}`, x + 8, y1 + 18 + index * 16, colW - 20);
        });
      }
      if (!g.windows.length) {
        ctx.fillStyle = "#64748b";
        ctx.font = font(400, 12);
        ctx.fillText("No openings", x + 4, gridTop + 22, colW - 16);
      }
    });
  });

  ctx.fillStyle = "#475569";
  ctx.font = font(500, 14);
  ctx.fillText(`Book a time: ${bookingUrl.replace(/^https?:\/\//, "")}`, left, H - 28);
  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = font(400, 12);
  ctx.fillText("TimeIQ", W - 24, H - 28);
  ctx.textAlign = "left";
  return canvas;
}
