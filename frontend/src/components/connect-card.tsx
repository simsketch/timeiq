"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/api";
import { ConnectStatus } from "@/lib/booking-payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Label } from "@/components/ui/label";

const STATUS_LABEL = { not_connected: "Not connected", needs_info: "Needs info", ready: "Ready" };

export function ConnectCard() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [country, setCountry] = useState("US");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const token = await getToken();
        const data = await apiFetch<ConnectStatus>("/api/connect/status", { headers: { Authorization: `Bearer ${token}` } });
        if (!active) return;
        setStatus(data);
        const params = new URLSearchParams(window.location.search);
        const result = params.get("connect");
        if (result === "return" || result === "refresh") {
          toast(result === "refresh" ? {
            title: "Stripe onboarding link expired",
            description: "Continue onboarding below to get a new link.",
            variant: "destructive",
          } : data.status === "ready" ? {
            title: "Stripe connected",
            description: "You can now set prices on your event types.",
          } : {
            title: "Stripe setup needs more information",
            description: "Continue onboarding below to enable charges and payouts.",
          });
          params.delete("connect");
          const query = params.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Account status did not load. Reload Booking page to try again.");
      }
    }
    load();
    return () => { active = false; };
  }, [getToken, toast]);

  async function open(action: "onboarding" | "dashboard") {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const result = await apiFetch<{ url: string }>(`/api/connect/${action}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        ...(action === "onboarding" ? { body: JSON.stringify({ country }) } : {}),
      });
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe did not open. Try again.");
      setBusy(false);
    }
  }

  return (
    <Card id="payments" className="scroll-mt-6">
      <CardHeader><CardTitle>Get paid for bookings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Connect your Stripe account to charge for event types. Payments go to your account. TimeIQ takes no platform fee. Stripe fees apply.</p>
        {status && <p className="text-sm">Status: {STATUS_LABEL[status.status]}</p>}
        {status && !status.enabled && <p className="text-sm text-muted-foreground">Booking payments are not configured. Contact the site owner to enable Stripe Connect.</p>}
        {status?.enabled && <div className="space-y-3">
          {status.status === "not_connected" && <div className="max-w-xs space-y-1">
            <Label htmlFor="connect-country">Business country code</Label>
            <Input id="connect-country" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
            <p className="text-xs text-muted-foreground">Use your two-letter country code, such as US, CA, or GB. Stripe checks availability for your country.</p>
          </div>}
          {status.status !== "ready" && <Button type="button" disabled={busy || !/^[A-Z]{2}$/.test(country)} onClick={() => open("onboarding")}>
            {busy ? "Opening Stripe…" : status.status === "not_connected" ? "Connect Stripe" : "Continue onboarding"}
          </Button>}
          {status.status !== "not_connected" && <Button type="button" variant="outline" className="ml-2" disabled={busy} onClick={() => open("dashboard")}>Open Stripe dashboard</Button>}
          {status.status === "needs_info" && <p className="text-xs text-muted-foreground">Finish Stripe&apos;s requested information to enable charges and payouts. If an onboarding link expires, use Continue onboarding to get a new link.</p>}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
