"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasSessionCookie } from "@/lib/session-cookie";

const noSubscribe = () => () => {};

/** Sign-in links for public pages, without loading Clerk. */
export function HeaderAuthLinks() {
  // Signed-out on the server and first paint; the cookie decides after hydration.
  const signedIn = useSyncExternalStore(noSubscribe, hasSessionCookie, () => false);

  if (signedIn) {
    return (
      <Link href="/dashboard">
        <Button variant="default">
          Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  }
  return (
    <>
      <Link href="/sign-in">
        <Button variant="ghost">Sign in</Button>
      </Link>
      <Link href="/sign-up">
        <Button variant="default">
          Get started
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </>
  );
}
