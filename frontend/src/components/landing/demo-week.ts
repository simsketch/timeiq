/**
 * Made-up week used by the homepage demos. Everything is local to the demo:
 * nothing here talks to the API.
 */

export const DEMO_ZONE = "America/New_York";
/** Monday of the demo week. US clocks fell back on Nov 1, so every day is EST. */
export const DEMO_MONDAY = "2026-11-02";
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WORK_START = 9;
export const WORK_END = 17;

export type CalendarKey = "work" | "personal" | "family" | "school";

export interface DemoCalendar {
  key: CalendarKey;
  name: string;
  source: string;
  /** CSS color for blocks and swatches. */
  color: string;
}

export const DEMO_CALENDARS: DemoCalendar[] = [
  { key: "work", name: "Work", source: "Outlook", color: "hsl(var(--aurora-1))" },
  { key: "personal", name: "Personal", source: "Google", color: "hsl(var(--aurora-4))" },
  { key: "family", name: "Family", source: "iCloud", color: "hsl(var(--aurora-3))" },
  { key: "school", name: "Kids' school", source: "Emailed in", color: "hsl(var(--aurora-2))" },
];

export interface DemoEvent {
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  /** Hours from midnight, e.g. 17.5 = 5:30 PM. */
  start: number;
  end: number;
  title: string;
  color: string;
  allDay?: boolean;
}

const cal = (key: CalendarKey) => DEMO_CALENDARS.find((c) => c.key === key)!.color;

/** Events behind the "all your calendars" demo, by calendar. */
export const MERGE_EVENTS: Record<CalendarKey, DemoEvent[]> = {
  work: [
    { id: "w1", day: 0, start: 10, end: 11, title: "Team standup", color: cal("work") },
    { id: "w2", day: 1, start: 13, end: 14.5, title: "Client review", color: cal("work") },
    { id: "w3", day: 3, start: 9, end: 10, title: "1:1 with Sam", color: cal("work") },
    { id: "w4", day: 4, start: 14, end: 15, title: "Sprint demo", color: cal("work") },
  ],
  personal: [
    { id: "p1", day: 2, start: 12, end: 13, title: "Gym", color: cal("personal") },
    { id: "p2", day: 4, start: 11, end: 12, title: "Lunch with Ana", color: cal("personal") },
  ],
  family: [
    { id: "f1", day: 1, start: 9.5, end: 10.5, title: "Dentist", color: cal("family") },
    { id: "f2", day: 3, start: 15, end: 17, title: "Parent-teacher", color: cal("family") },
  ],
  school: [
    { id: "s1", day: 2, start: 15, end: 17, title: "Early dismissal", color: cal("school") },
    { id: "s2", day: 0, start: 15.5, end: 16.5, title: "Field trip pickup", color: cal("school") },
  ],
};

/** Free stretches inside working hours on a day, given busy events. */
export function freeWindows(day: number, busy: DemoEvent[]): [number, number][] {
  const blocks = busy
    .filter((e) => e.day === day && !e.allDay)
    .map((e) => [Math.max(e.start, WORK_START), Math.min(e.end, WORK_END)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = WORK_START;
  for (const [s, e] of blocks) {
    if (s > cursor) out.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < WORK_END) out.push([cursor, WORK_END]);
  return out.filter(([s, e]) => e - s >= 0.5);
}

/** Start times of bookable 30-minute slots on a day. */
export function slotsFor(day: number, busy: DemoEvent[]): number[] {
  const slots: number[] = [];
  for (const [s, e] of freeWindows(day, busy)) {
    for (let t = Math.ceil(s * 2) / 2; t + 0.5 <= e; t += 0.5) slots.push(t);
  }
  return slots;
}

export function clock(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const suffix = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return mm ? `${h12}:${String(mm).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/** ISO timestamp for a demo day and hour, in EST. */
export function demoIso(day: number, hour: number): string {
  const d = new Date(`${DEMO_MONDAY}T00:00:00-05:00`);
  d.setTime(d.getTime() + (day * 24 + hour) * 3600_000);
  return d.toISOString();
}

export function dayDate(day: number): string {
  const d = new Date(`${DEMO_MONDAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return `${DAY_LABELS[day]} ${d.getUTCDate()}`;
}
