"use client";

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { track } from "@/components/meta-pixel";

import { apiFetch } from "@/lib/api";
import { readAttribution } from "@/lib/signup-attribution";

const FLAG = "tiq_registration_tracked";
const NEW_ACCOUNT_MS = 60 * 60 * 1000;

/**
 * Reports CompleteRegistration once, on a brand-new account's first dashboard
 * visit, so the ads can optimise for sign-ups now that accounts start free.
 */
export function SignupPixel() {
  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    if (!user?.createdAt || Date.now() - user.createdAt.getTime() > 24 * NEW_ACCOUNT_MS) return;
    (async () => {
      try {
        const attribution = readAttribution(window.localStorage);
        if (!attribution) return;
        const token = await getToken();
        await apiFetch("/api/me/attribution", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(attribution),
        });
      } catch { /* Attribution must never interrupt sign-in. */ }
    })();
  }, [user, getToken]);

  useEffect(() => {
    if (!user?.createdAt || Date.now() - user.createdAt.getTime() > NEW_ACCOUNT_MS) return;
    try {
      if (localStorage.getItem(FLAG)) return;
    } catch {
      return;
    }
    // The pixel script loads after hydration; wait briefly for its fbq stub.
    let tries = 0;
    const timer = setInterval(() => {
      if (window.fbq) {
        track("CompleteRegistration", { content_name: "free-account" });
        try {
          localStorage.setItem(FLAG, "1");
        } catch {}
      }
      if (window.fbq || ++tries > 20) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [user]);

  return null;
}
