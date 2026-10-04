import { InvoiceLine } from "@/lib/invoicing";

/**
 * Presentation grouping for invoice lines. Mirrors
 * backend/app/services/invoice_grouping.py — change both together.
 */

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
  amount: number;
}

const num = (v: string | null | undefined) => (v == null ? 0 : parseFloat(v) || 0);

export const isExpense = (l: InvoiceLine) => l.kind === "expense";

/** Parse a yyyy-MM-dd string as a local date, avoiding timezone shift. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function splitLines(lines: InvoiceLine[]): {
  timeLines: InvoiceLine[];
  expenseLines: InvoiceLine[];
} {
  return {
    timeLines: lines.filter((l) => !isExpense(l)),
    expenseLines: lines.filter(isExpense),
  };
}

/** Collapse time lines sharing a description and rate; first spelling wins. */
export function groupTimeLines(lines: InvoiceLine[]): GroupedLine[] {
  const groups = new Map<string, GroupedLine>();
  for (const line of lines) {
    if (isExpense(line)) continue;
    const rate = num(line.rate);
    const key = `${line.description.trim().replace(/\s+/g, " ").toLowerCase()}|${rate}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        description: line.description.trim(),
        firstDate: line.line_date,
        lastDate: line.line_date,
        hours: num(line.hours),
        rate,
        amount: num(line.amount),
      });
    } else {
      existing.hours += num(line.hours);
      existing.amount += num(line.amount);
      if (line.line_date < existing.firstDate) existing.firstDate = line.line_date;
      if (line.line_date > existing.lastDate) existing.lastDate = line.line_date;
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.firstDate.localeCompare(b.firstDate) ||
      a.description.toLowerCase().localeCompare(b.description.toLowerCase())
  );
}

/** Sunday that begins the week containing the given day, matching the timesheet. */
export function weekStartFor(iso: string): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() - d.getDay());
  return toIso(d);
}

export function weeklyBreakdown(lines: InvoiceLine[]): WeekRow[] {
  const weeks = new Map<string, { hours: number; amount: number }>();
  for (const line of lines) {
    if (isExpense(line)) continue;
    const start = weekStartFor(line.line_date);
    const bucket = weeks.get(start) ?? { hours: 0, amount: 0 };
    bucket.hours += num(line.hours);
    bucket.amount += num(line.amount);
    weeks.set(start, bucket);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, v]) => {
      const end = parseDay(start);
      end.setDate(end.getDate() + 6);
      return { weekStart: start, weekEnd: toIso(end), hours: v.hours, amount: v.amount };
    });
}

export function invoiceTotals(lines: InvoiceLine[]) {
  const { timeLines, expenseLines } = splitLines(lines);
  const hours = timeLines.reduce((s, l) => s + num(l.hours), 0);
  const timeAmount = timeLines.reduce((s, l) => s + num(l.amount), 0);
  const expenseAmount = expenseLines.reduce((s, l) => s + num(l.amount), 0);
  return { hours, timeAmount, expenseAmount, total: timeAmount + expenseAmount };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact range; the period line already carries the year. */
export function fmtSpan(first: string, last: string): string {
  const a = parseDay(first);
  const b = parseDay(last);
  const short = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (first === last) return short(a);
  if (a.getFullYear() !== b.getFullYear()) {
    return `${short(a)}, ${a.getFullYear()} - ${short(b)}, ${b.getFullYear()}`;
  }
  if (a.getMonth() === b.getMonth()) return `${short(a)} - ${b.getDate()}`;
  return `${short(a)} - ${short(b)}`;
}
