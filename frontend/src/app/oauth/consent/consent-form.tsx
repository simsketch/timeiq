"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
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
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Couldn't load this request. Add the connector again.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [getToken, request]);

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
      setError(cause instanceof Error ? cause.message : "Couldn't save your choice. Add the connector again.");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <p className="text-sm text-muted-foreground">TimeIQ</p>
        <CardTitle>Connect {details?.client_name || "an assistant"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!request ? (
          <p role="alert" className="text-sm">This connection request is invalid. Add the TimeIQ connector again.</p>
        ) : details ? (
          <>
            <p className="break-words text-sm">Allow this app to access TimeIQ as {details.email}?</p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Read and change your scheduling, time entries and invoices.</li>
              <li>Email people on your behalf when you confirm.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              App names are supplied by their developers. You will return to{" "}
              <span className="break-all font-mono">{details.redirect_uri}</span>.
              {" "}Disconnect this app any time in Settings → AI assistants.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => decide(true)} disabled={busy} className="flex-1">{busy ? "Saving…" : "Allow"}</Button>
              <Button onClick={() => decide(false)} disabled={busy} variant="outline" className="flex-1">Cancel</Button>
            </div>
          </>
        ) : !error ? <p role="status" className="text-sm text-muted-foreground">Loading connection request…</p> : null}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Link href="/settings" className="block text-sm underline underline-offset-4">Open TimeIQ Settings</Link>
      </CardContent>
    </Card>
  );
}
