/** Project an instant into wall-clock fields for a calendar grid in the account timezone. */
export function calendarDate(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
}

/** Convert a grid date back to an instant for the cached-events range query. */
export function calendarInstant(date: Date, timezone: string): Date {
  const wallTimestamp = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  const target = wallTimestamp(date);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const difference = target - wallTimestamp(calendarDate(new Date(instant), timezone));
    if (!difference) break;
    instant += difference;
  }
  return new Date(instant);
}
