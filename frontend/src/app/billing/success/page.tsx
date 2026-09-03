"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { track } from "@/components/meta-pixel";
import { apiFetch } from "@/lib/api";
import { BillingStatus, PLAN_LABEL } from "@/lib/billing";

function SuccessInner() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!sessionId) {
      setError("Missing checkout session");
      return;
    }
    (async () => {
      try {
        const token = await getToken();
        const s = await apiFetch<BillingStatus>("/api/billing/confirm", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId }),
        });
        setStatus(s);
        track("Purchase", { value: s.plan === "founder" ? 5 : 29, currency: "USD" });
      } catch (e: any) {
        setError(e.message || "Could not confirm your subscription");
      }
    })();
  }, [isLoaded, isSignedIn, sessionId, getToken]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="relative glass glass-chroma rounded-[1.75rem] p-10 max-w-md w-full text-center space-y-5">
        {error ? (
          <>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">
              If you were charged, your access will activate within a minute once Stripe notifies us.
            </p>
            <Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>
          </>
        ) : status ? (
          <>
            <div className="h-14 w-14 mx-auto rounded-full bg-[hsl(var(--aurora-4))] flex items-center justify-center shadow-[0_10px_30px_-8px_hsl(var(--aurora-4)/0.7)]">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <h1 className="font-display text-3xl tracking-[-0.02em]">You&apos;re in.</h1>
            <p className="text-muted-foreground text-pretty">
              {status.plan ? `${PLAN_LABEL[status.plan]} plan active.` : "Subscription active."}{" "}
              Thanks for backing TimeIQ this early.
            </p>
            <Button asChild variant="aurora" size="lg">
              <Link href="/dashboard">
                Open your workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        ) : (
          <ClockLoader size="lg" label="Confirming your subscription" />
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
