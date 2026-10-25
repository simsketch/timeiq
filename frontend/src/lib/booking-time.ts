import { addDays, format, isSameDay, startOfDay } from "date-fns";

/** How far ahead guests can book. The API rejects anything later. */
export const BOOKING_HORIZON_DAYS = 90;

export interface SlotOption {
  /** The slot's full ISO start, which is also its identity. */
  value: string;
  /** Start time in the guest's timezone. */
  label: string;
  /** The guest-local date, set only when it differs from the picked date. */
  note?: string;
}

/** The guest's IANA timezone, as the browser reports it. */
export function guestTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** A readable zone name with its current offset, e.g. "Asia/Tokyo (GMT+9)". */
export function timeZoneLabel(at: Date = new Date()): string {
  const zone = guestTimeZone();
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${zone.replace(/_/g, " ")} (${offset})` : zone.replace(/_/g, " ");
  } catch {
    return zone.replace(/_/g, " ");
  }
}

/** The last bookable day, in the guest's calendar. */
export function lastBookableDate(): Date {
  return addDays(startOfDay(new Date()), BOOKING_HORIZON_DAYS);
}

/**
 * Slots for the picked date, labelled in the guest's timezone. The API's dates
 * follow the host's calendar, so for guests far from the host some times land
 * on the day before or after; those carry their own guest-local date.
 */
export function slotOptions(slots: { start: string }[], pickedDate: Date): SlotOption[] {
  const ordered = [...slots].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  return ordered.map((slot) => {
    const start = new Date(slot.start);
    return {
      value: slot.start,
      label: format(start, "h:mm a"),
      note: isSameDay(start, pickedDate) ? undefined : format(start, "EEE, MMM d"),
    };
  });
}

/** "Monday, November 3, 2026" and "9:00 AM" for a slot, in the guest's timezone. */
export function describeSlot(iso: string) {
  const start = new Date(iso);
  return {
    date: format(start, "EEEE, MMMM d, yyyy"),
    time: format(start, "h:mm a"),
  };
}
