"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  ExternalLink,
  Send,
  Trash2,
  BellRing,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { StatusBadge } from "@/components/invoices/status-badge";
import { InvoiceView } from "@/components/invoices/invoice-view";
import { apiFetch } from "@/lib/api";
import { API_BASE, Invoice, InvoicePreview, authHeaders, fmtMoney } from "@/lib/invoicing";
import { splitLines } from "@/lib/invoice-grouping";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ issue_date: "", due_date: "", notes: "" });
  const [expense, setExpense] = useState({ description: "", amount: "" });

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !expense.description.trim() || !expense.amount) return;
    const ok = await action(
      `/api/invoices/${invoice.id}/lines`,
      "POST",
      { description: expense.description.trim(), amount: expense.amount },
      "Expense added"
    );
    if (ok) setExpense({ description: "", amount: "" });
  }

  async function removeExpense(lineId: string) {
    if (!invoice) return;
    await action(`/api/invoices/${invoice.id}/lines/${lineId}`, "DELETE", undefined, "Expense removed");
  }

  const [missing, setMissing] = useState<InvoicePreview | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const inv = await apiFetch<Invoice>(`/api/invoices/${id}`, { headers: authHeaders(token) });
      setInvoice(inv);
      // A draft can miss hours logged before auto-attach existed; surface them.
      if (inv.status === "draft") {
        const q = new URLSearchParams({
          client_id: inv.client_id,
          period_start: inv.period_start,
          period_end: inv.period_end,
        });
        apiFetch<InvoicePreview>(`/api/invoices/preview?${q}`, { headers: authHeaders(token) })
          .then(setMissing)
          .catch(() => setMissing(null));
      } else {
        setMissing(null);
      }
      setDraft({ issue_date: inv.issue_date, due_date: inv.due_date, notes: inv.notes ?? "" });
    } catch (e: any) {
      toast({ title: "Failed to load invoice", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function action(path: string, method: string, body?: unknown, successMsg?: string) {
    setBusy(true);
    try {
      const token = await getToken();
      await apiFetch(path, {
        method,
        headers: authHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (successMsg) toast({ title: successMsg });
      await load();
      return true;
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!invoice) return;
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/invoices/${invoice.id}/pdf`, {
      headers: authHeaders(token),
    });
    if (!res.ok) {
      toast({ title: "Download failed", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function send() {
    if (!invoice) return;
    if (!confirm(`Email ${invoice.number} to ${invoice.client_billing_email}?`)) return;
    await action(`/api/invoices/${invoice.id}/send`, "POST", undefined, "Invoice sent");
  }

  async function voidInvoice() {
    if (!invoice) return;
    if (!confirm("Void this invoice? Its entries become unbilled again.")) return;
    await action(`/api/invoices/${invoice.id}/void`, "POST", undefined, "Invoice voided");
  }

  async function remove() {
    if (!invoice) return;
    if (!confirm(`Delete draft ${invoice.number}? Its entries become unbilled again.`)) return;
    if (await action(`/api/invoices/${invoice.id}`, "DELETE", undefined, "Draft deleted")) {
      router.push("/invoices");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading invoice" />
      </div>
    );
  }
  if (!invoice) return <p className="text-muted-foreground">Invoice not found.</p>;

  const isDraft = invoice.status === "draft";
  const { expenseLines } = splitLines(invoice.lines);
  const isSent = invoice.status === "sent";
  const isVoid = invoice.status === "void";
  const isOverdue = isSent && new Date(invoice.due_date + "T23:59:59") < new Date();
  const publicUrl = `/invoice/${invoice.public_token}`;

  return (
    <div className="space-y-6">
      <Link
        href="/invoices"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Invoices
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight font-mono">{invoice.number}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!isVoid && (
            <Button variant="outline" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          )}
          {!isVoid && (
            <Button variant="outline" asChild>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Public link
              </a>
            </Button>
          )}
          {(isDraft || isSent) && (
            <Button onClick={send} disabled={busy || !invoice.client_billing_email}>
              <Send className="h-4 w-4 mr-2" />
              {isDraft ? "Send" : "Resend"}
            </Button>
          )}
          {isOverdue && (
            <Button
              variant="outline"
              disabled={busy || !invoice.client_billing_email}
              onClick={() => {
                if (confirm(`Send a past-due reminder for ${invoice.number} to ${invoice.client_billing_email}?`))
                  action(`/api/invoices/${invoice.id}/remind`, "POST", undefined, "Reminder sent");
              }}
            >
              <BellRing className="h-4 w-4 mr-2" />
              Send reminder
            </Button>
          )}
          {isSent && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => action(`/api/invoices/${invoice.id}/mark-paid`, "POST", undefined, "Marked paid")}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark paid
            </Button>
          )}
          {(isDraft || isSent) && (
            <Button variant="outline" disabled={busy} onClick={voidInvoice}>
              <Ban className="h-4 w-4 mr-2" />
              Void
            </Button>
          )}
          {isDraft && (
            <Button variant="destructive" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {isDraft && missing && missing.entry_count > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {missing.entry_count} unbilled {missing.entry_count === 1 ? "entry" : "entries"} (
            {parseFloat(String(missing.total_hours))}h) in this invoice&apos;s period{" "}
            {missing.entry_count === 1 ? "isn't" : "aren't"} on it yet.
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              action(`/api/invoices/${invoice.id}/refresh`, "POST", undefined, "Hours added to invoice")
            }
          >
            Add to invoice
          </Button>
        </div>
      )}

      {isDraft && !invoice.client_billing_email && (
        <p className="text-sm text-amber-600">
          This invoice has no billing email, so it can&apos;t be sent. Add one to the client, then void and
          recreate.
        </p>
      )}

      {isDraft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(`/api/invoices/${invoice.id}`, "PATCH", { ...draft, notes: draft.notes || null }, "Saved");
          }}
          className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] items-end rounded-xl border p-4"
        >
          <div className="space-y-2">
            <Label>Issue date</Label>
            <Input
              type="date"
              value={draft.issue_date}
              onChange={(e) => setDraft({ ...draft, issue_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input
              type="date"
              value={draft.due_date}
              onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={1} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            Save
          </Button>
        </form>
      )}

      {!isVoid && (
        <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="weekly-toggle">Show daily hours grid</Label>
            <p className="text-sm text-muted-foreground">
              Adds a day-by-day grid of hours above the services, so a steady
              schedule is easy to see. Hours only, with no amounts.
            </p>
          </div>
          <Switch
            id="weekly-toggle"
            checked={invoice.show_weekly_breakdown}
            disabled={busy}
            onCheckedChange={(v) =>
              action(
                `/api/invoices/${invoice.id}`,
                "PATCH",
                { show_weekly_breakdown: v },
                v ? "Hours grid shown" : "Hours grid hidden"
              )
            }
          />
        </div>
      )}

      {isDraft && (
        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <h2 className="font-semibold">Expenses</h2>
            <p className="text-sm text-muted-foreground">
              Pass-through costs billed alongside your hours, such as software seats or travel.
            </p>
          </div>

          {expenseLines.length > 0 && (
            <ul className="divide-y divide-border/60">
              {expenseLines.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm">{e.description}</span>
                  <span className="text-sm tabular-nums">
                    {fmtMoney(e.amount, invoice.currency)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${e.description}`}
                    disabled={busy}
                    onClick={() => removeExpense(e.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] items-end">
            <div className="space-y-2">
              <Label htmlFor="expense-desc">Description</Label>
              <Input
                id="expense-desc"
                placeholder="Claude Max subscription"
                value={expense.description}
                onChange={(e) => setExpense({ ...expense, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="200.00"
                value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !expense.description.trim() || !expense.amount}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add expense
            </Button>
          </form>
        </div>
      )}

      <InvoiceView
        invoice={{
          ...invoice,
          sender_name: user?.fullName || user?.primaryEmailAddress?.emailAddress || "",
          sender_email: user?.primaryEmailAddress?.emailAddress || "",
        }}
      />
    </div>
  );
}
