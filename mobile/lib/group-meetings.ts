/** Group meetings: find a time with several people (mirrors the website's types). */

export interface MeetingParticipant {
  id: string;
  email: string;
  name: string | null;
  responded: boolean;
  uses_calendar: boolean;
  link: string;
}

export interface MeetingSlot {
  start: string;
  yes: number;
  no: number;
  pending: number;
  answers: Record<string, boolean | null>;
}

export interface MeetingSummary {
  id: string;
  title: string;
  status: "open" | "booked" | "cancelled";
  duration_minutes: number;
  window_start: string;
  window_end: string;
  starts_at: string | null;
  participant_count: number;
  responded_count: number;
  created_at: string;
  source: "app" | "email" | "accepted";
}

export interface MeetingDetail extends MeetingSummary {
  note: string | null;
  location: string | null;
  timezone: string;
  participants: MeetingParticipant[];
  slots: MeetingSlot[];
}

export const personLabel = (p: { name: string | null; email: string }) => p.name || p.email;

/** "Tue, Nov 4, 9–9:30 AM EST" in `zone`. */
export function whenLabel(iso: string, minutes: number, zone: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const time = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(d).replace(":00", "");
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(start);
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(start).find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${day}, ${time(start)}–${time(end)} ${abbr}`;
}

/** Split typed or pasted text into email addresses. */
export function splitEmails(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))];
}
