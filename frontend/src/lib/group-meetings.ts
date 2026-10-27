/** Types and formatting for group meetings (find a time with several people). */

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
  source: "app" | "email";
}

export interface MeetingDetail extends MeetingSummary {
  note: string | null;
  location: string | null;
  timezone: string;
  participants: MeetingParticipant[];
  slots: MeetingSlot[];
}

export interface PublicSlot {
  start: string;
  can_make_it: number;
  mine: boolean | null;
}

export interface PublicMeeting {
  title: string;
  note: string | null;
  location: string | null;
  duration_minutes: number;
  organizer_name: string;
  organizer_timezone: string;
  status: "open" | "booked" | "cancelled";
  starts_at: string | null;
  ends_at: string | null;
  people: number;
  answered: number;
  me_name: string | null;
  me_email: string;
  uses_calendar: boolean;
  responded: boolean;
  slots: PublicSlot[];
}

export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function timeLabel(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone })
    .format(new Date(iso))
    .replace(":00", "");
}

export function dayLabel(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone }).format(
    new Date(iso)
  );
}

export function whenLabel(iso: string, minutes: number, zone: string): string {
  const end = new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
  const abbr =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date(iso))
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${dayLabel(iso, zone)}, ${timeLabel(iso, zone)}–${timeLabel(end, zone)} ${abbr}`;
}

/** Slots grouped by calendar day in the given zone, in time order. */
export function byDay<T extends { start: string }>(slots: T[], zone: string): { day: string; slots: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const s of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const key = dayLabel(s.start, zone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, slots: items }));
}

export function personLabel(p: { name: string | null; email: string }): string {
  return p.name || p.email;
}
