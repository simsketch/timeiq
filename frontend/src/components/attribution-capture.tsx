"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/signup-attribution";

export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    try { captureAttribution(window.location.href, window.localStorage); } catch { /* Private browsing. */ }
  }, [pathname]);
  return null;
}
