// Formatters are slow to build on Hermes, and a calendar grid formats hundreds of times per render.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = zone + JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, ...opts });
    formatters.set(key, f);
  }
  return f;
}

/** Formatting in a given IANA zone (the account's), whatever the phone's zone is. */
export function fmt(date: Date, zone: string, opts: Intl.DateTimeFormatOptions): string {
  return formatter(zone, opts).format(date);
}

export const timeOf = (d: Date, zone: string) => fmt(d, zone, { hour: "numeric", minute: "2-digit" });
export const dayKey = (d: Date, zone: string) => fmt(d, zone, { year: "numeric", month: "2-digit", day: "2-digit" });

const WALL: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/** The wall clock in `zone` at an instant. */
export function wallParts(d: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = formatter(zone, WALL).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** Minutes since midnight on the wall clock in `zone`. */
export const wallMinutes = (d: Date, zone: string) => {
  const p = wallParts(d, zone);
  return p.hour * 60 + p.minute;
};

/** The instant `minutes` past midnight (wall clock) in `zone`, on the calendar
 * day `offset` days from the day containing `from`. */
export function zoneTime(from: Date, zone: string, offset = 0, minutes = 0): Date {
  const p = wallParts(from, zone);
  const wall = Date.UTC(p.year, p.month - 1, p.day + offset, 0, minutes);
  // Find the instant whose wall clock in `zone` is that time (a few
  // corrections cover daylight-saving offsets).
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const g = wallParts(new Date(instant), zone);
    const seen = Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute);
    if (seen === wall) break;
    instant += wall - seen;
  }
  return new Date(instant);
}

/** Midnight in `zone` on the calendar day `offset` days from the day containing `from`. */
export function zoneDayStart(from: Date, zone: string, offset = 0): Date {
  return zoneTime(from, zone, offset, 0);
}

/** The next half hour from now. */
export function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}
