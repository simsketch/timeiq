import { useLocale, useTranslations } from "next-intl";
import { InvoiceLine, fmtDate, fmtMoney } from "@/lib/invoicing";
import {
  groupTimeLines,
  invoiceTotals,
  splitLines,
  weeklyBreakdown,
  dayOfWeek,
  fmtSpan,
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

// Jan 4, 2026 was a Sunday; the grid starts its weeks on Sunday.
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const weekdayName = (i: number, locale: string) => new Date(2026, 0, 4 + i).toLocaleDateString(locale, { weekday: "short" });
/** 8 -> "8", 7.5 -> "7.5", 0 -> blank, so the grid reads at a glance. */
const fmtDayHours = (h: number, locale: string) => (h ? h.toLocaleString(locale, { maximumFractionDigits: 2 }) : "");

export function InvoiceView({ invoice }: { invoice: InvoiceViewData }) {
  const grouped = groupTimeLines(invoice.lines);
  const weeks = weeklyBreakdown(invoice.lines);
  const { expenseLines } = splitLines(invoice.lines);
  const sums = invoiceTotals(invoice.lines);
  const t = useTranslations("invoiceView");
  const locale = useLocale();
  const money = (n: number) => fmtMoney(n, invoice.currency, locale);
  const num = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (iso: string) => fmtDate(iso, locale);
  return (
    <div className="rounded-2xl border bg-background p-6 sm:p-10 space-y-8">
      <div className="flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-lg font-semibold">{invoice.sender_name}</p>
          <p className="text-sm text-muted-foreground">{invoice.sender_email}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight uppercase">{t("title")}</p>
          <p className="font-mono">{invoice.number}</p>
          <p className="text-sm text-muted-foreground">{t("issued", { date: date(invoice.issue_date) })}</p>
          <p className="text-sm text-muted-foreground">{t("due", { date: date(invoice.due_date) })}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("billTo")}</p>
          <p className="font-medium">{invoice.client_name}</p>
          {invoice.client_contact_name && <p>{invoice.client_contact_name}</p>}
          {invoice.client_address && <p className="whitespace-pre-line">{invoice.client_address}</p>}
          {invoice.client_billing_email && (
            <p className="text-muted-foreground">{invoice.client_billing_email}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("period")}</p>
          <p>
            {t("periodRange", { start: date(invoice.period_start), end: date(invoice.period_end) })}
          </p>
        </div>
      </div>

      {invoice.show_weekly_breakdown !== false && weeks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">{t("hours")}</p>
          <p className="text-xs text-muted-foreground mb-2">
            {t("hoursHelp")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold text-left">{t("week")}</th>
                  {DAYS.map((d) => (
                    <th key={d} className="py-2 px-1 font-semibold text-right w-12">
                      {weekdayName(d, locale)}
                    </th>
                  ))}
                  <th className="py-2 pl-3 font-semibold text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.weekStart} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtSpan(w.weekStart, w.weekEnd, locale)}
                    </td>
                    {w.days.map((h, i) => {
                      const day = dayOfWeek(w.weekStart, i);
                      const outside = day < invoice.period_start || day > invoice.period_end;
                      return (
                        <td
                          key={i}
                          title={outside ? t("outsidePeriod") : undefined}
                          className={`py-1.5 px-1 text-right tabular-nums align-top ${outside ? "bg-muted/60" : ""}`}
                        >
                          <div
                            className={`text-[10px] leading-tight ${outside ? "text-muted-foreground/50" : "text-muted-foreground"}`}
                          >
                            {gridDayLabel(day, i === 0, locale)}
                          </div>
                          <div className="leading-tight">{fmtDayHours(h, locale)}</div>
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right tabular-nums">{num(w.hours)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">{t("total")}</td>
                  {DAYS.map((d, i) => (
                    <td key={d} className="py-2 px-1 text-right tabular-nums">
                      {fmtDayHours(weeks.reduce((s, w) => s + w.days[i], 0), locale)}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {num(weeks.reduce((s, w) => s + w.hours, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {grouped.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("services")}</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">{t("description")}</th>
                <th className="py-2 pr-3 font-semibold">{t("dates")}</th>
                <th className="py-2 pr-3 font-semibold text-right">{t("hoursColumn")}</th>
                <th className="py-2 pr-3 font-semibold text-right">{t("rate")}</th>
                <th className="py-2 font-semibold text-right">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={`${g.description}-${g.rate}`} className="border-b border-border/60">
                  <td className="py-2 pr-3">{g.description}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {fmtSpan(g.firstDate, g.lastDate, locale)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(g.hours)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(g.rate)}</td>
                  <td className="py-2 text-right tabular-nums">{num(g.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-3 pr-3" colSpan={2}>
                  {t("servicesSubtotal")}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">{num(sums.hours)}</td>
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
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("expenses")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">{t("expense")}</th>
                  <th className="py-2 pr-3 font-semibold">{t("date")}</th>
                  <th className="py-2 font-semibold text-right">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {expenseLines.map((e) => (
                  <tr key={e.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{e.description}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {date(e.line_date)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {num(parseFloat(e.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-3 pr-3" colSpan={2}>
                    {t("expensesSubtotal")}
                  </td>
                  <td className="py-3 text-right tabular-nums">{money(sums.expenseAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t-2 border-foreground pt-4">
        <span className="font-semibold tracking-tight uppercase">{t("totalDue")}</span>
        <span className="text-xl font-bold tabular-nums">
          {fmtMoney(invoice.subtotal, invoice.currency, locale)}
        </span>
      </div>

      {invoice.notes && (
        <div className="text-sm">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{t("notes")}</p>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
