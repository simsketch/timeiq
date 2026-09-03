"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { startCheckout } from "@/lib/billing";

/** Post-sign-up landing: immediately hands off to Stripe Checkout. */
export default function CheckoutRedirectPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clerk hydrates after the sign-in redirect; wait for it before asking for a token.
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in?redirect_url=/billing/checkout");
      return;
    }
    (async () => {
      try {
        const token = await getToken();
        window.location.href = await startCheckout(token);
      } catch (e: any) {
        setError(e.message || "Could not start checkout");
      }
    })();
  }, [isLoaded, isSignedIn, getToken, router]);

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="relative text-center space-y-4">
        {error ? (
          <>
            <p className="text-muted-foreground">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline"><Link href="/pricing">Back to pricing</Link></Button>
              <Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>
            </div>
          </>
        ) : (
          <ClockLoader size="lg" label="Opening secure checkout" />
        )}
      </div>
    </div>
  );
}
