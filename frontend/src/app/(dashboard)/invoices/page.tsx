"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { StatusBadge } from "@/components/invoices/status-badge";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Client,
  Invoice,
  InvoicePreview,
  InvoiceSummary,
  authHeaders,
  fmtDate,
  fmtHours,
  fmtMoney,
} from "@/lib/invoicing";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

const monthRange = (monthsAgo: number) => {
  const month = subMonths(new Date(), monthsAgo);
  return { period_start: iso(startOfMonth(month)), period_end: iso(endOfMonth(month)) };
};

const PERIOD_PRESETS = [
  { label: "thisMonth", monthsAgo: 0 },
  { label: "lastMonth", monthsAgo: 1 },
] as const;

export default function InvoicesPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({ client_id: "", ...monthRange(1) }));
  const [fetchedPreview, setPreview] = useState<{ key: string; data: InvoicePreview | null } | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      const [i, c] = await Promise.all([
        apiFetch<InvoiceSummary[]>("/api/invoices", { headers }),
        apiFetch<Client[]>("/api/clients", { headers }),
      ]);
      setInvoices(i);
      setClients(c);
      setForm((f) => (f.client_id || c.length === 0 ? f : { ...f, client_id: c[0].id }));
    } catch (e: any) {
      toast({ title: t("loadFailed"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast, t]);

  useEffect(() => {
    // Every setState in load() runs after its first await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const previewKey =
    open && form.client_id && form.period_start && form.period_end
      ? `${form.client_id}|${form.period_start}|${form.period_end}`
      : null;
  const preview = previewKey && fetchedPreview?.key === previewKey ? fetchedPreview.data : null;

  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const p = await apiFetch<InvoicePreview>(
          `/api/invoices/preview?client_id=${form.client_id}&period_start=${form.period_start}&period_end=${form.period_end}`,
          { headers: authHeaders(token) }
        );
        if (!cancelled) setPreview({ key: previewKey, data: p });
      } catch {
        if (!cancelled) setPreview({ key: previewKey, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewKey, form.client_id, form.period_start, form.period_end, getToken]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const token = await getToken();
      const inv = await apiFetch<Invoice>("/api/invoices", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(form),
      });
      toast({ title: t("created", { number: inv.number }) });
      setOpen(false);
      router.push(`/invoices/${inv.id}`);
    } catch (e: any) {
      toast({ title: tc("error"), description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={clients.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              {t("new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>{t("new")}</DialogTitle>
                <DialogDescription>{t("newDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("client")}</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("client")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label={t("period")}>
                  {PERIOD_PRESETS.map(({ label, monthsAgo }) => {
                    const range = monthRange(monthsAgo);
                    const active =
                      form.period_start === range.period_start && form.period_end === range.period_end;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setForm({ ...form, ...range })}
                        aria-pressed={active}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t(label)}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("from")}</Label>
                    <Input
                      type="date"
                      required
                      value={form.period_start}
                      onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("to")}</Label>
                    <Input
                      type="date"
                      required
                      value={form.period_end}
                      onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                    />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  {preview ? (
                    preview.entry_count === 0 ? (
                      <span className="text-muted-foreground">{t("noUnbilled")}</span>
                    ) : (
                      <span>
                        {t.rich("previewSummary", {
                          count: preview.entry_count,
                          hours: fmtHours(preview.total_hours),
                          amount: fmtMoney(preview.subtotal, preview.currency, locale),
                          strong: (chunks) => <strong>{chunks}</strong>,
                        })}
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">{t("selectClientPeriod")}</span>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating || !preview || preview.entry_count === 0}>
                  {t("createDraft")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <Card
              key={inv.id}
              className="cursor-pointer hover:bg-muted/30 transition"
              onClick={() => router.push(`/invoices/${inv.id}`)}
            >
              <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="font-mono font-semibold w-24">{inv.number}</span>
                <span className="flex-1 min-w-[10rem]">{inv.client_name}</span>
                <span className="text-sm text-muted-foreground">
                  {t("periodRange", { start: fmtDate(inv.period_start, locale), end: fmtDate(inv.period_end, locale) })}
                </span>
                <span className="font-medium tabular-nums w-28 text-right">
                  {fmtMoney(inv.subtotal, inv.currency, locale)}
                </span>
                <StatusBadge status={inv.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
