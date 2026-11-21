// Sample data for App Store screenshots (SCREENSHOT_MODE only). Never reached in production builds.
import type { AvailabilityRule, BillingStatus, Booking, CachedEvent, CalendarSource, EventType, Me } from "./api";
import { wallParts, zoneTime } from "./time";

const ZONE = "America/New_York";
const now = new Date();
const monday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short" }).format(now));
/** An instant this week: `day` 0 = Monday, at h:mm in New York. */
const at = (day: number, h: number, m = 0) => zoneTime(now, ZONE, day - monday, h * 60 + m).toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
const today = monday;
const tomorrow = Math.min(today + 1, 6);

const me: Me = {
  id: "u_maya",
  username: "maya",
  email: "maya@chenstudio.co",
  name: "Maya Chen",
  timezone: ZONE,
  image_url: null,
  invoicing_enabled: false,
  weekly_hours_target: 30,
  weekly_summary_enabled: true,
};

const eventTypes: EventType[] = [
  { id: "et_intro", name: "Intro call", slug: "intro", duration: 30, location: "Google Meet", is_active: true, description: "A quick hello to see how I can help.", color: "#6366f1", buffer_time: 10 },
  { id: "et_strategy", name: "Strategy session", slug: "strategy", duration: 60, location: "Zoom", is_active: true, description: "A focused hour on your plan.", price_cents: 15000, currency: "usd", buffer_time: 15 },
  { id: "et_coffee", name: "Coffee chat", slug: "coffee", duration: 45, location: "Blue Bottle, Bryant Park", is_active: true, description: "In person, my treat." },
];

const booking = (id: string, type: string, name: string, email: string, start: string, end: string, status = "confirmed", notes: string | null = null): Booking => ({
  id, event_type_id: type, visitor_name: name, visitor_email: email, visitor_notes: notes, starts_at: start, ends_at: end, timezone: ZONE, status, price_cents: null, currency: "usd",
});

const bookings: Booking[] = [
  booking("b1", "et_intro", "Jordan Patel", "jordan@northwind.io", at(today, 11), at(today, 11, 30), "confirmed", "Excited to talk about the new site."),
  booking("b2", "et_strategy", "Priya Raman", "priya@lumen.studio", at(today, 14), at(today, 15)),
  booking("b3", "et_coffee", "Sam Okafor", "sam@okafor.design", at(tomorrow, 10), at(tomorrow, 10, 45)),
  booking("b4", "et_intro", "Elena García", "elena@brightpath.org", at(3, 13), at(3, 13, 30)),
  booking("b5", "et_strategy", "Chris Novak", "chris@novak.co", at(4, 10), at(4, 11), "pending_payment"),
  booking("b6", "et_intro", "Aisha Bello", "aisha@kindred.app", at(-3, 15), at(-3, 15, 30)),
];

const event = (id: string, src: string, srcName: string, title: string, start: string, end: string): CachedEvent => ({
  id, calendar_source_id: src, title, starts_at: start, ends_at: end, is_all_day: false, source_name: srcName,
});

const events: CachedEvent[] = [0, 1, 2, 3, 4].flatMap((d) => [
  event(`standup${d}`, "cal_google", "Work", "Team standup", at(d, 9, 30), at(d, 9, 45)),
  event(`pickup${d}`, "cal_school", "Lincoln Elementary", "School pickup", at(d, 15, 15), at(d, 15, 45)),
]).concat([
  event("dentist", "cal_google", "Family", "Dentist", at(2, 8), at(2, 8, 45)),
  event("lunch", "cal_google", "Work", "Lunch with Dana", at(today, 12, 30), at(today, 13, 15)),
  // The 8 games and practices from the "Spring soccer schedule.pdf" import below: this week, next, and the one after.
]).concat([1, 3, 5, 8, 10, 12, 15, 17].map((d) =>
  d % 7 === 5
    ? event(`riverside${d}`, "cal_email", "From email", d === 5 ? "Riverside FC vs Lakeview" : "Riverside FC vs Northgate", at(d, 10), at(d, 11, 30))
    : event(`riverside${d}`, "cal_email", "From email", "Riverside FC practice", at(d, 17, 30), at(d, 18, 45))
));

/** The Import screen's "Added 8 events" card for the same schedule. */
export const screenshotImport = {
  id: "imp_soccer",
  status: "imported",
  name: "Spring soccer schedule",
  events: events
    .filter((e) => e.calendar_source_id === "cal_email")
    .map((e) => ({ title: e.title ?? "", starts_at: e.starts_at, ends_at: e.ends_at, is_all_day: false })),
};

const imports = [
  { id: "imp_soccer", sender: "coach@riverside-fc.org", subject: "Spring soccer schedule.pdf", status: "imported", event_count: 8, error: null, created_at: ago(190) },
];

const calendars: CalendarSource[] = [
  { id: "cal_google", type: "google", name: "maya@chenstudio.co", ics_url: null, is_active: true, last_synced_at: ago(3), sync_status: "ok", last_sync_error: null },
  { id: "cal_school", type: "ics_url", name: "Lincoln Elementary", ics_url: "https://lincoln.k12.example/calendar.ics", is_active: true, last_synced_at: ago(12), sync_status: "ok", last_sync_error: null },
];

const rules: AvailabilityRule[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day_of_week: d,
  start_time: d === 4 ? "09:00:00" : "09:30:00",
  end_time: d === 4 ? "13:00:00" : "15:00:00",
  is_active: d < 5,
}));

/** Open windows for the next `days` weekdays, around the bookings above. */
function summary(days: number) {
  const out = [];
  for (let i = 0; out.length < days; i++) {
    const d = new Date(zoneTime(now, ZONE, i, 12 * 60));
    const p = wallParts(d, ZONE);
    const dow = (monday + i) % 7;
    const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const w = (h1: number, m1: number, h2: number, m2: number) => ({ start: zoneTime(now, ZONE, i, h1 * 60 + m1).toISOString(), end: zoneTime(now, ZONE, i, h2 * 60 + m2).toISOString() });
    out.push({ date, windows: dow > 4 ? [] : [w(10, 0, 11, 0), w(13, 30, 15, 0)] });
  }
  return { timezone: ZONE, username: "maya", days: out };
}

const billing: BillingStatus = { enabled: false, entitled: true, subscribed: false, free_meetings: 0, free_meetings_left: null };

/** Answers `path` the way the API would for Maya. Unknown GETs get an empty list. */
export function screenshotResponse(path: string, init?: RequestInit): unknown {
  const method = init?.method ?? "GET";
  if (method !== "GET") return {};
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  switch (route) {
    case "/api/me": return me;
    case "/api/bookings": {
      const status = params.get("status");
      return status ? bookings.filter((b) => b.status === status) : bookings;
    }
    case "/api/calendars/cached-events": return events;
    case "/api/event-types": return eventTypes;
    case "/api/billing/status": return billing;
    case "/api/dashboard/stats": return { upcoming_bookings: bookings.filter((b) => b.status === "confirmed" && b.ends_at > now.toISOString()).length, total_event_types: eventTypes.length };
    case "/api/calendars": return calendars;
    case "/api/availability-rules": return rules;
    case "/api/availability/summary": return summary(Number(params.get("days")) || 7);
    case "/api/me/feed": return { url: "https://api.timeiq.app/feed/maya.ics", webcal_url: "webcal://api.timeiq.app/feed/maya.ics", obfuscate: false };
    case "/api/email-imports": return { address: "maya@in.timeiq.app", agent_address: "maya@in.timeiq.app", account_email: me.email, enabled: true, imports };
    case "/api/connect/status": return { enabled: false, status: "off", charges_enabled: false, payouts_enabled: false };
    case "/api/google/status":
    case "/api/microsoft/status": return { enabled: true };
    default: return [];
  }
}

/** The assistant's opening conversation, in the screen's Anthropic message format. */
export const screenshotAssistant = {
  history: [
    { role: "user" as const, content: "Find an hour with Sam next week" },
    {
      role: "assistant" as const,
      content: [
        {
          type: "text",
          text: "You and Sam are both free for an hour at these times next week:\n\n- **Tuesday** 10:00–11:00 AM\n- **Wednesday** 1:30–2:30 PM\n- **Thursday** 10:00–11:00 AM\n\nI sent Sam a find-a-time invite with these options. I'll book whichever one Sam picks and add it to your calendar.",
        },
      ],
    },
  ],
  steps: [[{ tool: "get_free_times", ok: true }, { tool: "list_calendar_events", ok: true }, { tool: "find_time_with", ok: true }]],
};
