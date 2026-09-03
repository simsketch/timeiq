import { format as formatDate } from "date-fns";

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  billing_email: string | null;
  address: string | null;
  hourly_rate: string;
  currency: string;
  payment_terms_days: number;
  match_keywords: string | null;
  unbilled_hours: string;
  unbilled_amount: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  client_id: string;
  client_name: string;
  entry_date: string;
  hours: string;
  description: string;
  invoice_id: string | null;
  invoice_number: string | null;
  created_at: string;
}

export interface UnbilledSummary {
  client_id: string;
  client_name: string;
  currency: string;
  unbilled_hours: string;
  unbilled_amount: string;
}

export interface InvoiceLine {
  id: string;
  time_entry_id: string | null;
  line_date: string;
  description: string;
  hours: string;
  rate: string;
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

export interface SuggestedEntry {
  external_id: string | null;
  title: string;
  entry_date: string;
  hours: string;
  starts_at: string;
  ends_at: string;
}

export interface PublicInvoice {
  number: string;
  status: InvoiceStatus;
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

export function fmtMoney(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function fmtHours(hours: string | number): string {
  const n = typeof hours === "string" ? parseFloat(hours) : hours;
  return `${n.toFixed(2)}h`;
}

/** Format a yyyy-MM-dd date string without timezone shift. */
export function fmtDate(iso: string, pattern = "MMM d, yyyy"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return formatDate(dt, pattern);
}


export function authHeaders(token: string | null): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
