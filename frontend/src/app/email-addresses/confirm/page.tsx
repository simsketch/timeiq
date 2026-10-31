"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api";

function ConfirmInner() {
  const token = useSearchParams().get("token");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This confirmation link is missing its code. Request another from Calendars.");

  async function confirm() {
    setBusy(true);
    try {
      const result = await apiFetch<{ email: string }>("/api/email-aliases/confirm", {
        method: "POST", body: JSON.stringify({ token }),
      });
      setEmail(result.email);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="relative z-10 glass glass-chroma rounded-[1.75rem] p-10 max-w-md w-full text-center space-y-5">
        {error ? (
          <>
            <h1 className="font-display text-2xl tracking-[-0.02em]">Couldn&apos;t confirm this address</h1>
            <p className="text-muted-foreground text-pretty">{error}</p>
            <Button asChild variant="outline"><Link href="/calendars">Open your calendars</Link></Button>
          </>
        ) : email ? (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-[hsl(var(--aurora-4))]" />
            <h1 className="font-display text-2xl tracking-[-0.02em]">Email address confirmed</h1>
            <p className="text-muted-foreground text-pretty">You can now cc or forward to the TimeIQ agent from {email}.</p>
            <Button asChild variant="outline"><Link href="/calendars">Open your calendars</Link></Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl tracking-[-0.02em]">Confirm your email address</h1>
            <p className="text-muted-foreground text-pretty">This lets TimeIQ recognize email you send from this address and act on your scheduling requests.</p>
            <Button variant="aurora" size="lg" onClick={confirm} disabled={busy}>
              <Mail className="h-4 w-4" />{busy ? "Confirming…" : "Confirm email address"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailAddressPage() {
  return <Suspense fallback={null}><ConfirmInner /></Suspense>;
}
