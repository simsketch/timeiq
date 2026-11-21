"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

interface ConsentDetails {
  client_name: string;
  redirect_uri: string;
  email: string;
}

export function ConsentForm({ request }: { request: string }) {
  const { getToken } = useAuth();
  const t = useTranslations("oauth");
  const common = useTranslations("common");
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!request) return;
      try {
        const data = await apiFetch<ConsentDetails>(`/api/oauth/consent?request=${encodeURIComponent(request)}`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
          cache: "no-store",
        });
        if (!cancelled) setDetails(data);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t("loadError"));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [getToken, request, t]);

  async function decide(allow: boolean) {
    if (busy || !details) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ redirect_url: string }>("/api/oauth/consent", {
        method: "POST",
        headers: { Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ request, allow }),
      });
      window.location.assign(result.redirect_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("saveError"));
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <p className="text-sm text-muted-foreground">TimeIQ</p>
        <CardTitle>{t("title", { name: details?.client_name || t("anAssistant") })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!request ? (
          <p role="alert" className="text-sm">{t("invalid")}</p>
        ) : details ? (
          <>
            <p className="break-words text-sm">{t("question", { email: details.email })}</p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>{t("scopeData")}</li>
              <li>{t("scopeEmail")}</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              {t.rich("note", {
                uri: details.redirect_uri,
                url: (chunks) => <span className="break-all font-mono">{chunks}</span>,
              })}
            </p>
            <div className="flex gap-3">
              <Button onClick={() => decide(true)} disabled={busy} className="flex-1">{busy ? common("saving") : t("allow")}</Button>
              <Button onClick={() => decide(false)} disabled={busy} variant="outline" className="flex-1">{common("cancel")}</Button>
            </div>
          </>
        ) : !error ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p> : null}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Link href="/settings" className="block text-sm underline underline-offset-4">{t("openSettings")}</Link>
      </CardContent>
    </Card>
  );
}
