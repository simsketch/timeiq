"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
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
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { Client, authHeaders, fmtHours, fmtMoney } from "@/lib/invoicing";

const EMPTY = {
  name: "",
  contact_name: "",
  billing_email: "",
  address: "",
  hourly_rate: "",
  currency: "USD",
  payment_terms_days: "30",
  match_keywords: "",
};

export default function ClientsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
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
      toast({ title: "Failed to load clients", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => {
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
      };
      await apiFetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
        method: editingId ? "PATCH" : "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      toast({ title: editingId ? "Client updated" : "Client added" });
      setOpen(false);
      reset();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Client) {
    if (!confirm(`Delete ${c.name}? This also deletes their time entries and invoices.`)) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/clients/${c.id}`, { method: "DELETE", headers: authHeaders(token) });
      toast({ title: "Client deleted" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading clients" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">Who you bill and at what rate.</p>
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
              New client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <form onSubmit={save}>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit" : "New"} client</DialogTitle>
                <DialogDescription>Billing details appear on invoices.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company name</Label>
                  <Input id="name" required {...field("name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact name</Label>
                  <Input id="contact_name" {...field("contact_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billing_email">Billing email</Label>
                  <Input id="billing_email" type="email" {...field("billing_email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" rows={3} {...field("address")} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate">Rate / hr</Label>
                    <Input id="hourly_rate" type="number" step="0.01" min="0" required {...field("hourly_rate")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input id="currency" maxLength={3} {...field("currency")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment_terms_days">Net days</Label>
                    <Input id="payment_terms_days" type="number" min="0" max="365" {...field("payment_terms_days")} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="match_keywords">Calendar keywords</Label>
                  <Input id="match_keywords" placeholder="acme, standup" {...field("match_keywords")} />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated. Calendar events whose title contains one of these can be imported as time entries.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No clients yet. Add the company you bill to get started.
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
                      {fmtMoney(c.hourly_rate, c.currency)} / hr · Net {c.payment_terms_days}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unbilled: {fmtHours(c.unbilled_hours)} · {fmtMoney(c.unbilled_amount, c.currency)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => startEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(c)}>
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
