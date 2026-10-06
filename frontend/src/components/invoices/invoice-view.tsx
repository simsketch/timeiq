import { InvoiceLine, fmtDate, fmtMoney } from "@/lib/invoicing";
import {
  fmtSpan,
  groupTimeLines,
  invoiceTotals,
  splitLines,
  weeklyBreakdown,
  dayOfWeek,
  gridDayLabel,
} from "@/lib/invoice-grouping";

export interface InvoiceViewData {
  number: string;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  currency: string;
  hourly_rate: string;
  subtotal: string;
  client_name: string;
  client_contact_name: string | null;
  client_billing_email: string | null;
  client_address: string | null;
  notes: string | null;
  show_weekly_breakdown?: boolean;
  sender_name: string;
  sender_email: string;
  lines: InvoiceLine[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 8 -> "8", 7.5 -> "7.5", 0 -> blank, so the grid reads at a glance. */
const fmtDayHours = (h: number) => (h ? String(Math.round(h * 100) / 100) : "");

export function InvoiceView({ invoice }: { invoice: InvoiceViewData }) {
  const grouped = groupTimeLines(invoice.lines);
  const weeks = weeklyBreakdown(invoice.lines);
  const { expenseLines } = splitLines(invoice.lines);
  const sums = invoiceTotals(invoice.lines);
  const money = (n: number) => fmtMoney(n, invoice.currency);
  return (
    <div className="rounded-2xl border bg-background p-6 sm:p-10 space-y-8">
      <div className="flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-lg font-semibold">{invoice.sender_name}</p>
          <p className="text-sm text-muted-foreground">{invoice.sender_email}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight">INVOICE</p>
          <p className="font-mono">{invoice.number}</p>
          <p className="text-sm text-muted-foreground">Issued {fmtDate(invoice.issue_date)}</p>
          <p className="text-sm text-muted-foreground">Due {fmtDate(invoice.due_date)}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">BILL TO</p>
          <p className="font-medium">{invoice.client_name}</p>
          {invoice.client_contact_name && <p>{invoice.client_contact_name}</p>}
          {invoice.client_address && <p className="whitespace-pre-line">{invoice.client_address}</p>}
          {invoice.client_billing_email && (
            <p className="text-muted-foreground">{invoice.client_billing_email}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">PERIOD</p>
          <p>
            {fmtDate(invoice.period_start)} to {fmtDate(invoice.period_end)}
          </p>
        </div>
      </div>

      {invoice.show_weekly_breakdown !== false && weeks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">HOURS</p>
          <p className="text-xs text-muted-foreground mb-2">
            Hours logged each day, billed in the services below. Shaded days fall
            outside the billing period.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold text-left">Week</th>
                  {DAYS.map((d) => (
                    <th key={d} className="py-2 px-1 font-semibold text-right w-12">
                      {d}
                    </th>
                  ))}
                  <th className="py-2 pl-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.weekStart} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtSpan(w.weekStart, w.weekEnd)}
                    </td>
                    {w.days.map((h, i) => {
                      const day = dayOfWeek(w.weekStart, i);
                      const outside = day < invoice.period_start || day > invoice.period_end;
                      return (
                        <td
                          key={i}
                          title={outside ? "Outside the billing period" : undefined}
                          className={`py-1.5 px-1 text-right tabular-nums align-top ${outside ? "bg-muted/60" : ""}`}
                        >
                          <div
                            className={`text-[10px] leading-tight ${outside ? "text-muted-foreground/50" : "text-muted-foreground"}`}
                          >
                            {gridDayLabel(day, i === 0)}
                          </div>
                          <div className="leading-tight">{fmtDayHours(h)}</div>
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right tabular-nums">{w.hours.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  {DAYS.map((d, i) => (
                    <td key={d} className="py-2 px-1 text-right tabular-nums">
                      {fmtDayHours(weeks.reduce((s, w) => s + w.days[i], 0))}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {weeks.reduce((s, w) => s + w.hours, 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {grouped.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">SERVICES</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Description</th>
                <th className="py-2 pr-3 font-semibold">Dates</th>
                <th className="py-2 pr-3 font-semibold text-right">Hours</th>
                <th className="py-2 pr-3 font-semibold text-right">Rate</th>
                <th className="py-2 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={`${g.description}-${g.rate}`} className="border-b border-border/60">
                  <td className="py-2 pr-3">{g.description}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {fmtSpan(g.firstDate, g.lastDate)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{g.hours.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{g.rate.toFixed(2)}</td>
                  <td className="py-2 text-right tabular-nums">{g.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-3 pr-3" colSpan={2}>
                  Services subtotal
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">{sums.hours.toFixed(2)}</td>
                <td />
                <td className="py-3 text-right tabular-nums">{money(sums.timeAmount)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {expenseLines.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">EXPENSES</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Expense</th>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenseLines.map((e) => (
                  <tr key={e.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{e.description}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {fmtDate(e.line_date)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {parseFloat(e.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-3 pr-3" colSpan={2}>
                    Expenses subtotal
                  </td>
                  <td className="py-3 text-right tabular-nums">{money(sums.expenseAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t-2 border-foreground pt-4">
        <span className="font-semibold tracking-tight">TOTAL DUE</span>
        <span className="text-xl font-bold tabular-nums">
          {fmtMoney(invoice.subtotal, invoice.currency)}
        </span>
      </div>

      {invoice.notes && (
        <div className="text-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-1">NOTES</p>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
