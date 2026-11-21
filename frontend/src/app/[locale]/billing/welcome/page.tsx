"use client";

import { Suspense, useEffect, useState } from "react";
import { SignUp, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { track } from "@/components/meta-pixel";
import { GuestSession, fetchGuestSession } from "@/lib/billing";

/** Report a purchase once per checkout, even if the page is reloaded. */
function trackPurchaseOnce(sessionId: string, s: GuestSession) {
  const key = `timeiq-purchase-${sessionId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: report anyway.
  }
  // A trial's checkout total is 0; report the price it converts at.
  const value = s.amount_cents ? s.amount_cents / 100 : s.plan === "founder" ? 19 : 29;
  track(s.trialing ? "StartTrial" : "Purchase", { value, currency: s.currency, predicted_ltv: value });
}

/** After paying without an account: confirm the purchase, then create the account. */
function WelcomeInner() {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useTranslations("billing");
  const router = useRouter();
  const sessionId = useSearchParams().get("session_id");
  const [session, setSession] = useState<GuestSession | null>(null);
  const [error, setError] = useState<string | null>(sessionId ? null : t("missingDetails"));

  const finishUrl = sessionId ? `/billing/success?session_id=${encodeURIComponent(sessionId)}&guest=1` : "/dashboard";

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let tries = 0;
    async function load() {
      try {
        const s = await fetchGuestSession(sessionId!);
        if (cancelled) return;
        if (s.paid) {
          trackPurchaseOnce(sessionId!, s);
          setSession(s);
        } else if (++tries < 10) {
          // Stripe can take a few seconds to confirm the payment.
          setTimeout(load, 2000);
        } else {
          setError(t("notConfirmed"));
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("notFound"));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, t]);

  // Already signed in: attach the purchase to this account straight away.
  useEffect(() => {
    if (session && isLoaded && isSignedIn) router.replace(finishUrl);
  }, [session, isLoaded, isSignedIn, router, finishUrl]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="relative z-10 w-full max-w-md space-y-6">
        {error ? (
          <div className="glass glass-chroma rounded-[1.75rem] p-10 text-center space-y-4">
            <p className="text-muted-foreground text-pretty">{error}</p>
            <p className="text-xs text-muted-foreground">
              {t("help")}
            </p>
            <Button asChild variant="outline"><Link href="/">{t("backHome")}</Link></Button>
          </div>
        ) : session && isLoaded && !isSignedIn ? (
          <>
            <div className="text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-[hsl(var(--aurora-4))] flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <h1 className="font-display text-3xl tracking-[-0.02em]">{t("youreIn")}</h1>
              <p className="text-muted-foreground text-pretty">
                {t(session.trialing ? "secured.trial" : "secured.paid", { plan: session.plan === "founder" ? "founder" : "standard" })}{" "}
                {session.email
                  ? t.rich("lastStepEmail", { email: session.email, b: (chunks) => <span className="text-foreground">{chunks}</span> })
                  : t("lastStep")}
              </p>
            </div>
            <div className="flex justify-center">
              <SignUp
                routing="hash"
                initialValues={session.email ? { emailAddress: session.email } : undefined}
                forceRedirectUrl={finishUrl}
                signInForceRedirectUrl={finishUrl}
              />
            </div>
          </>
        ) : (
          <div className="flex justify-center">
            <ClockLoader size="lg" label={t("confirmingPayment")} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function BillingWelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeInner />
    </Suspense>
  );
}
