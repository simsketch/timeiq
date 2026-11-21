"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { ConnectStatus } from "@/lib/booking-payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Label } from "@/components/ui/label";

export function ConnectCard() {
  const t = useTranslations("bookings.payments");
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
            title: t("expired"),
            description: t("expiredBody"),
            variant: "destructive",
          } : data.status === "ready" ? {
            title: t("connected"),
            description: t("connectedBody"),
          } : {
            title: t("needsInfo"),
            description: t("needsInfoBody"),
          });
          params.delete("connect");
          const query = params.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : t("statusFailed"));
      }
    }
    load();
    return () => { active = false; };
  }, [getToken, toast, t]);

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
      setError(e instanceof Error ? e.message : t("openFailed"));
      setBusy(false);
    }
  }

  return (
    <Card id="payments" className="scroll-mt-6">
      <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {status && <p className="text-sm">{t("status", { status: status.status })}</p>}
        {status && !status.enabled && <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>}
        {status?.enabled && <div className="space-y-3">
          {status.status === "not_connected" && <div className="max-w-xs space-y-1">
            <Label htmlFor="connect-country">{t("country")}</Label>
            <Input id="connect-country" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
            <p className="text-xs text-muted-foreground">{t("countryHint")}</p>
          </div>}
          {status.status !== "ready" && <Button type="button" disabled={busy || !/^[A-Z]{2}$/.test(country)} onClick={() => open("onboarding")}>
            {busy ? t("opening") : status.status === "not_connected" ? t("connect") : t("continue")}
          </Button>}
          {status.status !== "not_connected" && <Button type="button" variant="outline" className="ml-2" disabled={busy} onClick={() => open("dashboard")}>{t("dashboard")}</Button>}
          {status.status === "needs_info" && <p className="text-xs text-muted-foreground">{t("finish")}</p>}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
