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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { StatusBadge } from "@/components/invoices/status-badge";
import { InvoiceView } from "@/components/invoices/invoice-view";
import { apiFetch } from "@/lib/api";
import { API_BASE, Invoice, authHeaders } from "@/lib/invoicing";

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

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const inv = await apiFetch<Invoice>(`/api/invoices/${id}`, { headers: authHeaders(token) });
      setInvoice(inv);
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
  const isSent = invoice.status === "sent";
  const isVoid = invoice.status === "void";
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
