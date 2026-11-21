"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  MailCheck,
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
import { SendDialog } from "@/components/invoices/send-dialog";
import { apiFetch } from "@/lib/api";
import { API_BASE, Invoice, InvoicePreview, authHeaders, fmtMoney } from "@/lib/invoicing";
import { splitLines } from "@/lib/invoice-grouping";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("invoices.detail");
  const tc = useTranslations("common");
  const locale = useLocale();
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
      t("expenseAdded")
    );
    if (ok) setExpense({ description: "", amount: "" });
  }

  async function removeExpense(lineId: string) {
    if (!invoice) return;
    await action(`/api/invoices/${invoice.id}/lines/${lineId}`, "DELETE", undefined, t("expenseRemoved"));
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
      toast({ title: t("loadFailed"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, id, toast, t]);

  useEffect(() => {
    // Every setState in load() runs after its first await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      toast({ title: tc("error"), description: e.message, variant: "destructive" });
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
      toast({ title: t("downloadFailed"), variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [sending, setSending] = useState<"send" | "remind" | null>(null);

  async function confirmSend(recipients: string[], copyMe: boolean) {
    if (!invoice || !sending) return;
    const who = recipients.length === 1 ? recipients[0] : t("recipients", { count: recipients.length });
    const ok = await action(
      `/api/invoices/${invoice.id}/${sending}`,
      "POST",
      { recipients, copy_me: copyMe },
      t("sentToast", { kind: sending, who, copy: copyMe ? "yes" : "no" })
    );
    if (ok) setSending(null);
  }

  async function voidInvoice() {
    if (!invoice) return;
    if (!confirm(t("confirmVoid"))) return;
    await action(`/api/invoices/${invoice.id}/void`, "POST", undefined, t("voided"));
  }

  async function remove() {
    if (!invoice) return;
    if (!confirm(t("confirmDelete", { number: invoice.number }))) return;
    if (await action(`/api/invoices/${invoice.id}`, "DELETE", undefined, t("deleted"))) {
      router.push("/invoices");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label={t("loading")} />
      </div>
    );
  }
  if (!invoice) return <p className="text-muted-foreground">{t("notFound")}</p>;

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
        {t("back")}
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
                {t("publicLink")}
              </a>
            </Button>
          )}
          {(isDraft || isSent) && (
            <Button onClick={() => setSending("send")} disabled={busy || !invoice.client_billing_email}>
              <Send className="h-4 w-4 mr-2" />
              {isDraft ? t("send") : t("resend")}
            </Button>
          )}
          {(isSent || invoice.status === "paid") && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                action(
                  `/api/invoices/${invoice.id}/copy`,
                  "POST",
                  undefined,
                  user?.primaryEmailAddress?.emailAddress
                    ? t("copySentTo", { email: user.primaryEmailAddress.emailAddress })
                    : t("copySent")
                )
              }
            >
              <MailCheck className="h-4 w-4 mr-2" />
              {t("emailMeCopy")}
            </Button>
          )}
          {isOverdue && (
            <Button
              variant="outline"
              disabled={busy || !invoice.client_billing_email}
              onClick={() => setSending("remind")}
            >
              <BellRing className="h-4 w-4 mr-2" />
              {t("sendReminder")}
            </Button>
          )}
          {isSent && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => action(`/api/invoices/${invoice.id}/mark-paid`, "POST", undefined, t("markedPaid"))}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {t("markPaid")}
            </Button>
          )}
          {(isDraft || isSent) && (
            <Button variant="outline" disabled={busy} onClick={voidInvoice}>
              <Ban className="h-4 w-4 mr-2" />
              {t("void")}
            </Button>
          )}
          {isDraft && (
            <Button variant="destructive" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4 mr-2" />
              {tc("delete")}
            </Button>
          )}
        </div>
      </div>

      {isDraft && missing && missing.entry_count > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {t("missingEntries", { count: missing.entry_count, hours: parseFloat(String(missing.total_hours)) })}
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              action(`/api/invoices/${invoice.id}/refresh`, "POST", undefined, t("hoursAdded"))
            }
          >
            {t("addToInvoice")}
          </Button>
        </div>
      )}

      {isDraft && !invoice.client_billing_email && (
        <p className="text-sm text-amber-600">
          {t("noBillingEmail")}
        </p>
      )}

      {isDraft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(`/api/invoices/${invoice.id}`, "PATCH", { ...draft, notes: draft.notes || null }, tc("saved"));
          }}
          className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] items-end rounded-xl border p-4"
        >
          <div className="space-y-2">
            <Label>{t("issueDate")}</Label>
            <Input
              type="date"
              value={draft.issue_date}
              onChange={(e) => setDraft({ ...draft, issue_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("dueDate")}</Label>
            <Input
              type="date"
              value={draft.due_date}
              onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("notes")}</Label>
            <Textarea rows={1} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {tc("save")}
          </Button>
        </form>
      )}

      {!isVoid && (
        <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="weekly-toggle">{t("gridToggle")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("gridHint")}
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
                v ? t("gridShown") : t("gridHidden")
              )
            }
          />
        </div>
      )}

      {isDraft && (
        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <h2 className="font-semibold">{t("expenses")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("expensesHint")}
            </p>
          </div>

          {expenseLines.length > 0 && (
            <ul className="divide-y divide-border/60">
              {expenseLines.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm">{e.description}</span>
                  <span className="text-sm tabular-nums">
                    {fmtMoney(e.amount, invoice.currency, locale)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("removeExpense", { name: e.description })}
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
              <Label htmlFor="expense-desc">{t("description")}</Label>
              <Input
                id="expense-desc"
                placeholder={t("expensePlaceholder")}
                value={expense.description}
                onChange={(e) => setExpense({ ...expense, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">{t("amount")}</Label>
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
              {t("addExpense")}
            </Button>
          </form>
        </div>
      )}

      <SendDialog
        open={sending !== null}
        onOpenChange={(o) => !o && setSending(null)}
        title={
          sending === "remind"
            ? t("remindTitle", { number: invoice.number })
            : isDraft
            ? t("sendTitle", { number: invoice.number })
            : t("resendTitle", { number: invoice.number })
        }
        description={
          sending === "remind" ? t("remindDescription") : t("sendDescription")
        }
        confirmLabel={sending === "remind" ? t("sendReminder") : isDraft ? t("send") : t("resend")}
        billingEmails={invoice.client_billing_email}
        senderEmail={user?.primaryEmailAddress?.emailAddress}
        busy={busy}
        onConfirm={confirmSend}
      />

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
