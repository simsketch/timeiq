import { InvoiceLine, fmtDate, fmtMoney } from "@/lib/invoicing";

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
  sender_name: string;
  sender_email: string;
  lines: InvoiceLine[];
}

export function InvoiceView({ invoice }: { invoice: InvoiceViewData }) {
  const totalHours = invoice.lines.reduce((s, l) => s + parseFloat(l.hours), 0);
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
          <p className="text-xs font-semibold text-muted-foreground mt-3 mb-1">RATE</p>
          <p>{fmtMoney(invoice.hourly_rate, invoice.currency)} / hour</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Description</th>
              <th className="py-2 pr-3 font-semibold text-right">Hours</th>
              <th className="py-2 pr-3 font-semibold text-right">Rate</th>
              <th className="py-2 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-border/60">
                <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(l.line_date)}</td>
                <td className="py-2 pr-3">{l.description}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{parseFloat(l.hours).toFixed(2)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{parseFloat(l.rate).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">{parseFloat(l.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-3" />
              <td className="py-3 pr-3">Total</td>
              <td className="py-3 pr-3 text-right tabular-nums">{totalHours.toFixed(2)}</td>
              <td />
              <td className="py-3 text-right tabular-nums">
                {fmtMoney(invoice.subtotal, invoice.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
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
