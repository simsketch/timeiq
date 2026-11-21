"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("gate");
  const { isLoaded, getToken, userId } = useAuth();
  const pathname = usePathname() ?? "";
  const exempt = exemptPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [status, setStatus] = useState<BillingStatus | null | "error">(null);
  // Someone who was entitled last visit sees the page right away while the
  // status is re-checked, so the page's own data loads in parallel with it.
  // The API enforces the subscription on every request either way.
  const knownEntitled = useSyncExternalStore(
    noSubscribe,
    () => !!userId && readEntitled() === userId,
    () => false,
  );

  useEffect(() => {
    if (!isLoaded || exempt) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const s = await fetchBillingStatus(token);
        if (!cancelled) {
          setStatus(s);
          writeEntitled(s.enabled && !s.entitled ? null : userId ?? null);
        }
      } catch {
        // Fail open so a billing hiccup never locks people out of their data.
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken, exempt, userId]);

  if (exempt) return <>{children}</>;

  if (status === null && knownEntitled) return <>{children}</>;

  if (status === null) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label={t("loading")} />
      </div>
    );
  }

  if (status !== "error" && status.enabled && !status.entitled) {
    const lapsed = status.status !== "none";
    return (
      <div className="space-y-8 py-6">
        <div className="text-center max-w-xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">
            {lapsed ? t("ended") : t("freeBooked", { count: status.free_meetings })}
          </div>
          <h1 className="text-4xl lg:text-5xl leading-[1.02] tracking-[-0.025em] text-balance">
            <span className="font-display">{lapsed ? t("lapsedHeading") : t("heading")}</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-pretty">
            {lapsed ? t("lapsedBody") : t("body")}
          </p>
        </div>
        <PricingCard />
      </div>
    );
  }

  const left = status !== null && status !== "error" ? status.free_meetings_left : null;
  return (
    <>
      {left !== null && left > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-foreground/[0.08] bg-background/60 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {t.rich("left", {
              left,
              total: status !== "error" && status !== null ? status.free_meetings : 7,
              strong: (chunks) => <span className="font-medium text-foreground tabular-nums">{chunks}</span>,
            })}
          </span>
          <Link href="/pricing" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
            {t("seePlans")}
          </Link>
        </div>
      )}
      {children}
    </>
  );
}

const ENTITLED_KEY = "timeiq.entitled";

const noSubscribe = () => () => {};

function readEntitled(): string | null {
  try {
    return window.localStorage.getItem(ENTITLED_KEY);
  } catch {
    return null;
  }
}

function writeEntitled(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(ENTITLED_KEY, userId);
    else window.localStorage.removeItem(ENTITLED_KEY);
  } catch {
    // Storage can be unavailable (private windows); the gate then waits for the check.
  }
}
