"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";

export const FIX_CALENDAR_EVENT = "timeiq:fix-calendar";

// Shown across the dashboard while any calendar is broken, so a dead feed
// can't quietly stop blocking time on the booking page.
export function CalendarHealthBanner() {
  const { getToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [broken, setBroken] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const cals = await apiFetch<{ id: string; name: string; sync_status: string }[]>("/api/calendars", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setBroken(cals.filter((c) => c.sync_status === "broken").map((c) => ({ id: c.id, name: c.name })));
      } catch {
        // No banner beats a broken banner.
      }
    })();
  }, []);

  if (broken.length === 0) return null;
  const names = broken.length === 1 ? broken[0].name : `${broken.length} calendars`;

  // Fixing starts the broken calendar's reconnect on the Calendars page. When
  // that page is already open, tell it directly: a link to itself does nothing.
  function fix() {
    const id = broken[0].id;
    if (pathname === "/calendars") window.dispatchEvent(new CustomEvent(FIX_CALENDAR_EVENT, { detail: id }));
    else router.push(`/calendars?fix=${encodeURIComponent(id)}`);
  }
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <p>
        <strong>{names}</strong> {broken.length === 1 ? "has" : "have"} stopped syncing, so new events there aren&apos;t
        blocking your booking page.{" "}
        <button type="button" onClick={fix} className="font-semibold underline underline-offset-2">
          Fix it
        </button>
      </p>
    </div>
  );
}
