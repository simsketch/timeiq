"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { Client, authHeaders, fmtHours, fmtMoney } from "@/lib/invoicing";
import { EmailChips } from "@/components/clients/email-chips";

const EMPTY = {
  name: "",
  contact_name: "",
  billing_email: "",
  address: "",
  hourly_rate: "",
  currency: "USD",
  payment_terms_days: "30",
  match_keywords: "",
  auto_invoice_monthly: false,
};

export default function ClientsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      setClients(await apiFetch<Client[]>("/api/clients", { headers: authHeaders(token) }));
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

  function startEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      contact_name: c.contact_name ?? "",
      billing_email: c.billing_email ?? "",
      address: c.address ?? "",
      hourly_rate: c.hourly_rate,
      currency: c.currency,
      payment_terms_days: String(c.payment_terms_days),
      match_keywords: c.match_keywords ?? "",
      auto_invoice_monthly: c.auto_invoice_monthly,
    });
    setOpen(true);
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const body = {
        name: form.name,
        contact_name: form.contact_name || null,
        billing_email: form.billing_email || null,
        address: form.address || null,
        hourly_rate: form.hourly_rate,
        currency: form.currency.toUpperCase(),
        payment_terms_days: Number(form.payment_terms_days),
        match_keywords: form.match_keywords || null,
        auto_invoice_monthly: form.auto_invoice_monthly,
      };
      await apiFetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
        method: editingId ? "PATCH" : "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      toast({ title: editingId ? t("updated") : t("added") });
      setOpen(false);
      reset();
      load();
    } catch (e: any) {
      toast({ title: tc("error"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Client) {
    if (!confirm(t("confirmDelete", { name: c.name }))) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/clients/${c.id}`, { method: "DELETE", headers: authHeaders(token) });
      toast({ title: t("deleted") });
      load();
    } catch (e: any) {
      toast({ title: tc("error"), description: e.message, variant: "destructive" });
    }
  }

  const field = (key: Exclude<keyof typeof EMPTY, "auto_invoice_monthly">) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

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
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <form onSubmit={save}>
              <DialogHeader>
                <DialogTitle>{editingId ? t("editTitle") : t("new")}</DialogTitle>
                <DialogDescription>{t("dialogDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("companyName")}</Label>
                  <Input id="name" required {...field("name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">{t("contactName")}</Label>
                  <Input id="contact_name" {...field("contact_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billing_email">{t("billingEmails")}</Label>
                  <EmailChips
                    id="billing_email"
                    value={form.billing_email}
                    onChange={(billing_email) => setForm((f) => ({ ...f, billing_email }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("billingEmailsHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">{t("address")}</Label>
                  <Textarea id="address" rows={3} {...field("address")} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate">{t("rate")}</Label>
                    <Input id="hourly_rate" type="number" step="0.01" min="0" required {...field("hourly_rate")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t("currency")}</Label>
                    <Input id="currency" maxLength={3} {...field("currency")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment_terms_days">{t("netDays")}</Label>
                    <Input id="payment_terms_days" type="number" min="0" max="365" {...field("payment_terms_days")} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="match_keywords">{t("keywords")}</Label>
                  <Input id="match_keywords" placeholder={t("keywordsPlaceholder")} {...field("match_keywords")} />
                  <p className="text-xs text-muted-foreground">
                    {t("keywordsHint")}
                  </p>
                </div>
                <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
                  <div>
                    <Label htmlFor="auto_invoice">{t("autoInvoice")}</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("autoInvoiceHint")}
                    </p>
                  </div>
                  <Switch
                    id="auto_invoice"
                    checked={form.auto_invoice_monthly}
                    onCheckedChange={(v) => setForm({ ...form, auto_invoice_monthly: v })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? tc("saving") : tc("save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{c.name}</h3>
                    {c.contact_name && <p className="text-sm text-muted-foreground">{c.contact_name}</p>}
                    {c.billing_email && (
                      <p className="text-sm text-muted-foreground truncate">{c.billing_email}</p>
                    )}
                    <p className="text-sm mt-2">
                      {t("rateLine", { rate: fmtMoney(c.hourly_rate, c.currency, locale), days: c.payment_terms_days })}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("unbilledLine", { hours: fmtHours(c.unbilled_hours), amount: fmtMoney(c.unbilled_amount, c.currency, locale) })}
                    </p>
                    {c.auto_invoice_monthly && (
                      <Badge variant="secondary" className="mt-2 font-normal">{t("autoInvoiceBadge")}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => startEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={tc("delete")} onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
