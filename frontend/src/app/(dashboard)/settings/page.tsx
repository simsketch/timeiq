"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { CreditCard, Download, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/invoicing";
import Link from "next/link";
import { BillingStatus, PLAN_LABEL, fetchBillingStatus, openPortal } from "@/lib/billing";
import { ClockLoader } from "@/components/ui/clock-loader";
import { ApiTokensCard } from "@/components/api-tokens-card";

interface UserSettings {
  name: string;
  timezone: string;
  weekly_hours_target: number;
  weekly_summary_enabled: boolean;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Australia/Sydney",
  "UTC",
];

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/me/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "timeiq-export.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (deleteText !== "DELETE") return;
    if (!confirm("This permanently deletes your account, bookings, time entries, clients, and invoices. Continue?")) return;
    setDeleting(true);
    try {
      const token = await getToken();
      await apiFetch("/api/me", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await signOut();
      router.push("/");
    } catch (error: any) {
      toast({ title: "Could not delete account", description: error.message, variant: "destructive" });
      setDeleting(false);
    }
  }
  const [settings, setSettings] = useState<UserSettings>({
    name: "",
    timezone: "America/New_York",
    weekly_hours_target: 40,
    weekly_summary_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  async function fetchBilling() {
    try {
      const token = await getToken();
      setBilling(await fetchBillingStatus(token));
    } catch (error) {
      console.error("Failed to fetch billing status:", error);
    }
  }

  async function manageBilling() {
    setPortalBusy(true);
    try {
      const token = await getToken();
      window.location.href = await openPortal(token);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setPortalBusy(false);
    }
  }

  async function fetchSettings() {
    try {
      const token = await getToken();
      const data = await apiFetch<UserSettings>("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettings(data);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      // Set defaults
      setSettings({
        name: user?.fullName || "",
        timezone: "America/New_York",
        weekly_hours_target: 40,
        weekly_summary_enabled: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      await apiFetch("/api/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: settings.name, timezone: settings.timezone, weekly_hours_target: settings.weekly_hours_target, weekly_summary_enabled: settings.weekly_summary_enabled }),
      });
      toast({ title: "Settings updated successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("connect")) router.replace(`/event-types?${params.toString()}#payments`);
    // Every setState in these fetches runs after their first await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings();
    fetchBilling();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading settings" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account preferences.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Your booking link, page look, payments and website widget are on{" "}
        <Link href="/event-types" className="underline underline-offset-4">Booking page</Link>.
        {" "}Find your calendar subscription on{" "}
        <Link href="/calendars#subscription" className="underline underline-offset-4">Calendars</Link>.
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={settings.name}
                onChange={(e) =>
                  setSettings({ ...settings, name: e.target.value })
                }
                placeholder="Your full name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is the name shown to guests in emails and calendar invites
              </p>
            </div>

            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={settings.timezone}
                onValueChange={(value) =>
                  setSettings({ ...settings, timezone: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="weekly_hours_target">Weekly hours target</Label>
          <Input
            id="weekly_hours_target"
            type="number"
            min={0}
            max={168}
            value={settings.weekly_hours_target}
            onChange={(e) => setSettings({ ...settings, weekly_hours_target: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">Shown on the timesheet as progress for the week.</p>
        </div>

        <div className="flex items-center justify-between gap-4 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="weekly_summary_enabled">Your week email</Label>
            <p className="text-xs text-muted-foreground">Your bookings, open time and billing every Monday around 7 am in your timezone.</p>
          </div>
          <Switch
            id="weekly_summary_enabled"
            checked={settings.weekly_summary_enabled}
            onCheckedChange={(value) => setSettings({ ...settings, weekly_summary_enabled: value })}
          />
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </form>

      <ApiTokensCard />

      {billing?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Plan:</span>{" "}
                  <span className="font-medium">
                    {billing.status === "complimentary"
                      ? "Complimentary"
                      : billing.plan
                      ? PLAN_LABEL[billing.plan]
                      : "None"}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className="font-medium capitalize">{billing.status.replace("_", " ")}</span>
                </p>
                {billing.current_period_end && (
                  <p>
                    <span className="text-muted-foreground">
                      {billing.status === "canceled" ? "Access until:" : "Renews:"}
                    </span>{" "}
                    <span className="font-medium">
                      {new Date(billing.current_period_end).toLocaleDateString(undefined, {
                        year: "numeric", month: "long", day: "numeric",
                      })}
                    </span>
                  </p>
                )}
              </div>
              {billing.has_customer ? (
                <Button variant="outline" onClick={manageBilling} disabled={portalBusy}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {portalBusy ? "Opening…" : "Manage billing"}
                </Button>
              ) : billing.status !== "complimentary" ? (
                <Button asChild>
                  <Link href="/pricing">Subscribe</Link>
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Invoices, payment method, and cancellation are handled in the Stripe billing portal.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground max-w-md">
              Download everything you have created as a zip of CSV files: clients, time entries, invoices, invoice lines, and bookings.
            </p>
            <Button variant="outline" onClick={exportData} disabled={exporting}>
              <Download className="h-4 w-4 mr-2" />
              {exporting ? "Preparing…" : "Export data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground max-w-md">
            Removes your sign-in, cancels any subscription, and permanently deletes your bookings, time entries, clients, and invoices. Export first if you want a copy.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
              <Input id="delete-confirm" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} className="w-48" />
            </div>
            <Button variant="destructive" onClick={deleteAccount} disabled={deleting || deleteText !== "DELETE"}>
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
