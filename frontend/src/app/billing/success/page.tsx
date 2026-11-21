"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { track } from "@/components/meta-pixel";
import { apiFetch } from "@/lib/api";
import type { BillingStatus } from "@/lib/billing";

function SuccessInner() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const t = useTranslations("billing");
  const locale = useLocale();
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  // Guest purchases were already reported on the welcome page.
  const fromGuest = params.get("guest") === "1";
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [confirmError, setError] = useState<string | null>(null);
  const error =
    isLoaded && isSignedIn && !sessionId ? t("missingSession") : confirmError;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;
    (async () => {
      try {
        const token = await getToken();
        const s = await apiFetch<BillingStatus>("/api/billing/confirm", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId }),
        });
        setStatus(s);
        if (!fromGuest) {
          const value = s.plan === "founder" ? 19 : 29;
          // A trial charges nothing today; it's a trial start until it converts.
          track(s.status === "trialing" ? "StartTrial" : "Purchase", { value, currency: "USD", predicted_ltv: value });
        }
      } catch (e: any) {
        setError(e.message || t("confirmFailed"));
      }
    })();
  }, [isLoaded, isSignedIn, sessionId, fromGuest, getToken, t]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="relative glass glass-chroma rounded-[1.75rem] p-10 max-w-md w-full text-center space-y-5">
        {error ? (
          <>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">
              {t("chargedNote")}
            </p>
            <Button asChild><Link href="/dashboard">{t("goDashboard")}</Link></Button>
          </>
        ) : status ? (
          <>
            <div className="h-14 w-14 mx-auto rounded-full bg-[hsl(var(--aurora-4))] flex items-center justify-center shadow-[0_10px_30px_-8px_hsl(var(--aurora-4)/0.7)]">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <h1 className="font-display text-3xl tracking-[-0.02em]">{t("youreIn")}</h1>
            <p className="text-muted-foreground text-pretty">
              {status.status === "trialing" && status.current_period_end
                ? t("trialUntil", { date: new Date(status.current_period_end).toLocaleDateString(locale, { month: "long", day: "numeric" }) })
                : `${status.plan === "founder" || status.plan === "standard" ? t(`planActive.${status.plan}`) : t("subscriptionActive")} ${t("thanks")}`}
            </p>
            <Button asChild variant="aurora" size="lg">
              <Link href="/dashboard">
                {t("openWorkspace")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        ) : (
          <ClockLoader size="lg" label={t("confirming")} />
        )}
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
