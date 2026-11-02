/** Formatting in a given IANA zone (the account's), whatever the phone's zone is. */
export function fmt(date: Date, zone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, ...opts }).format(date);
}

export const timeOf = (d: Date, zone: string) => fmt(d, zone, { hour: "numeric", minute: "2-digit" });
export const dayKey = (d: Date, zone: string) => fmt(d, zone, { year: "numeric", month: "2-digit", day: "2-digit" });

/** Midnight in `zone` on the calendar day `offset` days from the day containing `from`. */
export function zoneDayStart(from: Date, zone: string, offset = 0): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(from);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day") + offset);
  // Find the instant whose wall clock in `zone` is that midnight (a few
  // corrections cover daylight-saving offsets).
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    const seen = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
    if (seen === wall) break;
    instant += wall - seen;
  }
  return new Date(instant);
}

/** The next half hour from now. */
export function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}
