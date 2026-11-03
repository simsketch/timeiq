/** Time tracking, clients and invoices: API shapes (mirroring
 * backend/app/schemas) and date/money helpers shared by those screens.
 * Decimals arrive from FastAPI as strings. */

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  billing_email: string | null; // "a@x.com, b@y.com"
  address: string | null;
  hourly_rate: string;
  currency: string;
  payment_terms_days: number;
  match_keywords: string | null;
  auto_invoice_monthly: boolean;
  unbilled_hours: string;
  unbilled_amount: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  client_id: string;
  client_name: string;
  entry_date: string; // yyyy-MM-dd
  hours: string;
  description: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  created_at: string;
}

export interface TimesheetRow {
  id: string;
  client_id: string;
  client_name: string;
  description: string;
  created_at: string;
}

export interface MoneyStats {
  currency: string;
  hours_this_week: number;
  weekly_hours_target: number;
  unbilled_amount: number;
  outstanding_amount: number;
  outstanding_count: number;
  paid_this_month: number;
}

export interface UnbilledSummary {
  client_id: string;
  client_name: string;
  currency: string;
  unbilled_hours: string;
  unbilled_amount: string;
}

export interface SuggestedEntry {
  external_id: string | null;
  title: string;
  entry_date: string;
  hours: string;
  starts_at: string;
  ends_at: string;
}

export interface InvoiceLine {
  id: string;
  time_entry_id: string | null;
  line_date: string;
  description: string;
  /** "time" lines carry hours x rate; "expense" lines carry only an amount. */
  kind: "time" | "expense";
  hours: string | null;
  rate: string | null;
  amount: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface InvoiceSummary {
  id: string;
  client_id: string;
  client_name: string;
  number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  currency: string;
  subtotal: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Invoice extends InvoiceSummary {
  show_weekly_breakdown: boolean;
  hourly_rate: string;
  client_contact_name: string | null;
  client_billing_email: string | null;
  client_address: string | null;
  notes: string | null;
  public_token: string;
  lines: InvoiceLine[];
}

export interface InvoicePreview {
  entry_count: number;
  total_hours: string;
  subtotal: string;
  currency: string;
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" };

/** One readable colour per status; the badge tints its background with it. */
export const STATUS_COLOR: Record<InvoiceStatus, string> = { draft: "#64748b", sent: "#3b82f6", paid: "#10b981", void: "#f43f5e" };

const num = (v: string | number | null | undefined) => (v == null ? 0 : typeof v === "number" ? v : parseFloat(v) || 0);

export function fmtMoney(amount: string | number, currency: string): string {
  const n = num(amount);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const fmtHours = (hours: string | number) => `${num(hours).toFixed(2)}h`;

/** 4.5 -> "4h 30m", 2 -> "2h", 0 -> "" */
export function fmtHm(hours: number): string {
  if (!hours) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Accepts "2", "2.5", "2h", "2h 30m", "30m", "1:30". Null when unreadable. */
export function parseHours(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (hm && (hm[1] || hm[2])) return (hm[1] ? parseFloat(hm[1]) : 0) + (hm[2] ? parseInt(hm[2]) / 60 : 0);
  return null;
}

/** "a@x.com, b@y.com" -> ["a@x.com", "b@y.com"]; commas, semicolons or spaces split. */
export const splitEmails = (raw: string | null | undefined) => (raw ?? "").split(/[,;\s]+/).filter(Boolean);
export const looksLikeEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);

// ---- Calendar days as yyyy-MM-dd strings (no time zone involved) ----

const pad = (n: number) => String(n).padStart(2, "0");
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Today's date in the account's zone. */
export function todayIn(zone: string): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** 0 = Sunday. */
export const weekdayOf = (iso: string) => toUtc(iso).getUTCDay();

/** The Sunday that starts the week containing `iso`, as on the web timesheet. */
export const weekStartOf = (iso: string) => addDays(iso, -weekdayOf(iso));

/** First and last day of the month `monthsAgo` before the one containing `iso`. */
export function monthRange(iso: string, monthsAgo: number): { period_start: string; period_end: string } {
  const d = toUtc(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo + 1, 0));
  return { period_start: fromUtc(start), period_end: fromUtc(end) };
}

/** Format a yyyy-MM-dd day; defaults to "Nov 3, 2026". */
export function fmtDay(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(toUtc(iso));
}

/** yyyy-MM-dd <-> a local Date at noon, for the platform date picker. */
export function dayToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export const dateToDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Compact range; "Nov 3", "Nov 3 - 9", "Oct 27 - Nov 2". */
export function fmtSpan(first: string, last: string): string {
  const short = (iso: string) => fmtDay(iso, { month: "short", day: "numeric" });
  if (first === last) return short(first);
  const [a, b] = [toUtc(first), toUtc(last)];
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${short(first)}, ${a.getUTCFullYear()} - ${short(last)}, ${b.getUTCFullYear()}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${short(first)} - ${b.getUTCDate()}`;
  return `${short(first)} - ${short(last)}`;
}

// ---- Invoice line grouping (mirrors frontend/src/lib/invoice-grouping.ts) ----

export interface GroupedLine {
  description: string;
  firstDate: string;
  lastDate: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface WeekRow {
  weekStart: string;
  weekEnd: string;
  hours: number;
  /** Hours per day, Sunday first. */
  days: number[];
}

export const isExpense = (l: InvoiceLine) => l.kind === "expense";

/** Collapse time lines sharing a description and rate; first spelling wins. */
export function groupTimeLines(lines: InvoiceLine[]): GroupedLine[] {
  const groups = new Map<string, GroupedLine>();
  for (const line of lines) {
    if (isExpense(line)) continue;
    const rate = num(line.rate);
    const key = `${line.description.trim().replace(/\s+/g, " ").toLowerCase()}|${rate}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { description: line.description.trim(), firstDate: line.line_date, lastDate: line.line_date, hours: num(line.hours), rate, amount: num(line.amount) });
    } else {
      g.hours += num(line.hours);
      g.amount += num(line.amount);
      if (line.line_date < g.firstDate) g.firstDate = line.line_date;
      if (line.line_date > g.lastDate) g.lastDate = line.line_date;
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.firstDate.localeCompare(b.firstDate) || a.description.toLowerCase().localeCompare(b.description.toLowerCase())
  );
}

export function weeklyBreakdown(lines: InvoiceLine[]): WeekRow[] {
  const weeks = new Map<string, { hours: number; days: number[] }>();
  for (const line of lines) {
    if (isExpense(line)) continue;
    const start = weekStartOf(line.line_date);
    const bucket = weeks.get(start) ?? { hours: 0, days: [0, 0, 0, 0, 0, 0, 0] };
    bucket.hours += num(line.hours);
    bucket.days[weekdayOf(line.line_date)] += num(line.hours);
    weeks.set(start, bucket);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, v]) => ({ weekStart: start, weekEnd: addDays(start, 6), hours: v.hours, days: v.days }));
}

export function invoiceTotals(lines: InvoiceLine[]) {
  const time = lines.filter((l) => !isExpense(l));
  const expenses = lines.filter(isExpense);
  const hours = time.reduce((s, l) => s + num(l.hours), 0);
  const timeAmount = time.reduce((s, l) => s + num(l.amount), 0);
  const expenseAmount = expenses.reduce((s, l) => s + num(l.amount), 0);
  return { hours, timeAmount, expenseAmount, total: timeAmount + expenseAmount, expenses };
}

/** A sent invoice past the end of its due date. */
export const isOverdue = (inv: InvoiceSummary, today: string) => inv.status === "sent" && inv.due_date < today;

export const errorText = (e: unknown, fallback = "Try again.") => (e instanceof Error ? e.message : fallback);
