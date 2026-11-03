"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasSessionCookie } from "@/lib/session-cookie";

const noSubscribe = () => () => {};
// On the dark landing hero the primary action is a plain white pill.
const PILL = "rounded-full bg-white px-5 text-[#050505] shadow-none hover:bg-white/85";


/** Sign-in links for public pages, without loading Clerk. */
export function HeaderAuthLinks({ onDark = false }: { onDark?: boolean }) {
  // Signed-out on the server and first paint; the cookie decides after hydration.
  const signedIn = useSyncExternalStore(noSubscribe, hasSessionCookie, () => false);

  if (signedIn) {
    return (
      <Link href="/dashboard">
        <Button variant="default" className={onDark ? PILL : undefined}>
          Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  }
  return (
    <>
      <Link href="/sign-in">
        <Button variant="ghost" className={onDark ? "text-[#b6b5b5] hover:bg-transparent hover:text-white" : undefined}>Sign in</Button>
      </Link>
      <Link href="/sign-up">
        <Button variant="default" className={onDark ? PILL : undefined}>
          Start free
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </>
  );
}
