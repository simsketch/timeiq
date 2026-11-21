"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api";

function ConfirmInner() {
  const token = useSearchParams().get("token");
  const t = useTranslations("misc");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(token ? null : t("confirmMissing"));

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
            <h1 className="font-display text-2xl tracking-[-0.02em]">{t("confirmFailed")}</h1>
            <p className="text-muted-foreground text-pretty">{error}</p>
            <Button asChild variant="outline"><Link href="/calendars">{t("openCalendars")}</Link></Button>
          </>
        ) : email ? (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-[hsl(var(--aurora-4))]" />
            <h1 className="font-display text-2xl tracking-[-0.02em]">{t("confirmed")}</h1>
            <p className="text-muted-foreground text-pretty">{t("confirmedBody", { email })}</p>
            <Button asChild variant="outline"><Link href="/calendars">{t("openCalendars")}</Link></Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl tracking-[-0.02em]">{t("confirmTitle")}</h1>
            <p className="text-muted-foreground text-pretty">{t("confirmBody")}</p>
            <Button variant="aurora" size="lg" onClick={confirm} disabled={busy}>
              <Mail className="h-4 w-4" />{busy ? t("confirming") : t("confirmButton")}
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
