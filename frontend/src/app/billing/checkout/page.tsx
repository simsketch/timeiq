"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { startCheckout, startGuestCheckout } from "@/lib/billing";

/** Hands off to Stripe Checkout. Signed-out visitors pay first and create their account after. */
export default function CheckoutRedirectPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clerk hydrates after the sign-in redirect; wait for it before asking for a token.
    if (!isLoaded) return;
    (async () => {
      try {
        window.location.href = isSignedIn ? await startCheckout(await getToken()) : await startGuestCheckout();
      } catch (e: any) {
        setError(e.message || "Could not start checkout");
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

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
