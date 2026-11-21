"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";

export const FIX_CALENDAR_EVENT = "timeiq:fix-calendar";

// Shown across the dashboard while any calendar is broken, so a dead feed
// can't quietly stop blocking time on the booking page.
export function CalendarHealthBanner() {
  const t = useTranslations("calendars");
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
        {t.rich("brokenBanner", { count: broken.length, name: broken[0].name, strong: (chunks) => <strong>{chunks}</strong> })}{" "}
        <button type="button" onClick={fix} className="font-semibold underline underline-offset-2">
          {t("fixIt")}
        </button>
      </p>
    </div>
  );
}
