"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full page loads are deliberate, see HeaderAuthLinks */

import { useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { hasSessionCookie } from "@/lib/session-cookie";

const noSubscribe = () => () => {};
// On the dark landing hero the primary action is a plain white pill.
const PILL = "rounded-full bg-white px-3.5 sm:px-5 text-[#050505] shadow-none hover:bg-white/85";


/** Sign-in links for public pages, without loading Clerk. Plain <a> on purpose: a full page load
 * lets Clerk refresh an expired session; a client-side <Link> would bounce signed-in people to sign-in. */
export function HeaderAuthLinks({ onDark = false }: { onDark?: boolean }) {
  // Signed-out on the server and first paint; the cookie decides after hydration.
  const signedIn = useSyncExternalStore(noSubscribe, hasSessionCookie, () => false);
  const t = useTranslations("shell");

  if (signedIn) {
    return (
      <a href="/dashboard">
        <Button variant="default" className={onDark ? PILL : undefined}>
          {t("dashboard")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </a>
    );
  }
  return (
    <>
      <a href="/sign-in">
        <Button variant="ghost" className={onDark ? "px-2 text-[#b6b5b5] hover:bg-transparent hover:text-white sm:px-4" : undefined}>{t("signIn")}</Button>
      </a>
      <a href="/sign-up">
        <Button variant="default" className={onDark ? PILL : undefined}>
          {t("startFree")}
          {/* Hidden on phones so longer translations still fit beside Sign in. */}
          <ArrowRight className="hidden h-4 w-4 sm:block" />
        </Button>
      </a>
    </>
  );
}
