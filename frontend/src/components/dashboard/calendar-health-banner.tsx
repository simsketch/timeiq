"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";

// Shown across the dashboard while any calendar is broken, so a dead feed
// can't quietly stop blocking time on the booking page.
export function CalendarHealthBanner() {
  const { getToken } = useAuth();
  const [broken, setBroken] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const cals = await apiFetch<{ name: string; sync_status: string }[]>("/api/calendars", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setBroken(cals.filter((c) => c.sync_status === "broken").map((c) => c.name));
      } catch {
        // No banner beats a broken banner.
      }
    })();
  }, []);

  if (broken.length === 0) return null;
  const names = broken.length === 1 ? broken[0] : `${broken.length} calendars`;
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <p>
        <strong>{names}</strong> {broken.length === 1 ? "has" : "have"} stopped syncing, so new events there aren&apos;t
        blocking your booking page.{" "}
        <Link href="/calendars" className="font-semibold underline underline-offset-2">
          Fix it
        </Link>
      </p>
    </div>
  );
}
