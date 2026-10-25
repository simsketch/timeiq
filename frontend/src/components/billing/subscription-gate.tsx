"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ClockLoader } from "@/components/ui/clock-loader";
import { PricingCard } from "@/components/billing/pricing-card";
import { BillingStatus, fetchBillingStatus } from "@/lib/billing";

/**
 * Wraps dashboard content. When billing is enabled and the user isn't
 * entitled, shows the paywall instead of the page. Routes under
 * `exemptPaths` (account management) always render.
 */
export function SubscriptionGate({
  children,
  exemptPaths = [],
}: {
  children: React.ReactNode;
  exemptPaths?: string[];
}) {
  const { isLoaded, getToken } = useAuth();
  const pathname = usePathname() ?? "";
  const exempt = exemptPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [status, setStatus] = useState<BillingStatus | null | "error">(null);

  useEffect(() => {
    if (!isLoaded || exempt) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const s = await fetchBillingStatus(token);
        if (!cancelled) setStatus(s);
      } catch {
        // Fail open so a billing hiccup never locks people out of their data.
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken, exempt]);

  if (exempt) return <>{children}</>;

  if (status === null) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading" />
      </div>
    );
  }

  if (status !== "error" && status.enabled && !status.entitled) {
    const lapsed = status.status !== "none";
    return (
      <div className="space-y-8 py-6">
        <div className="text-center max-w-xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">
            {lapsed ? "Subscription ended" : "Almost there"}
          </div>
          <h1 className="text-4xl lg:text-5xl leading-[1.02] tracking-[-0.025em] text-balance">
            <span className="font-display">{lapsed ? "Pick up where you left off." : "Unlock your workspace."}</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-pretty">
            {lapsed
              ? "Your bookings, time, and invoices are all still here. Renew to keep going."
              : "One small yearly payment covers scheduling, time tracking, and invoicing."}
          </p>
        </div>
        <PricingCard />
      </div>
    );
  }

  return <>{children}</>;
}
