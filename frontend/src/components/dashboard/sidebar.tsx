"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  LayoutDashboard,
  Calendar,
  Clock,
  CalendarDays,
  BookOpen,
  Settings,
  Timer,
  Users,
  Receipt,
  UsersRound,
} from "lucide-react";
import type { Messages } from "next-intl";
import { LogoIcon } from "@/components/logo";

const routes: { label: keyof Messages["nav"]; icon: typeof Settings; href: string; invoicing?: boolean; admin?: boolean }[] = [
  // label is a key in the "nav" messages.
  { label: "home", icon: LayoutDashboard, href: "/dashboard" },
  { label: "bookingPage", icon: Calendar, href: "/event-types" },
  { label: "availability", icon: Clock, href: "/availability" },
  { label: "calendars", icon: CalendarDays, href: "/calendars" },
  { label: "bookings", icon: BookOpen, href: "/bookings" },
  { label: "meetings", icon: UsersRound, href: "/meetings" },
  { label: "time", icon: Timer, href: "/time", invoicing: true },
  { label: "clients", icon: Users, href: "/clients", invoicing: true },
  { label: "invoices", icon: Receipt, href: "/invoices", invoicing: true },
  { label: "settings", icon: Settings, href: "/settings" },
  { label: "admin", icon: ShieldCheck, href: "/admin", admin: true },
];

/** Time tracking and invoicing show only for accounts they're switched on for. */
function useAccountFeatures() {
  const { getToken, isLoaded } = useAuth();
  const [enabled, setEnabled] = useState({ invoicing: false, admin: false });
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const me = await apiFetch<{ invoicing_enabled?: boolean; is_admin?: boolean }>("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setEnabled({ invoicing: !!me.invoicing_enabled, admin: !!me.is_admin });
      } catch {
        // Hidden stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);
  return enabled;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const features = useAccountFeatures();
  const visible = routes.filter((r) => (!r.invoicing || features.invoicing) && (!r.admin || features.admin));

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col rounded-[1.5rem] overflow-hidden aurora-bg-dark">
      <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_20px_60px_-20px_rgba(0,0,0,0.5)]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col py-7">
        <div className="px-6 mb-9">
          <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 group">
            <LogoIcon className="h-12 w-12 shrink-0" />
            <span className="text-2xl font-semibold tracking-tight text-white">
              TimeIQ
            </span>
          </Link>
          <div className="mt-1 text-xs text-white/40">
            {t("workspace")}
          </div>
        </div>

        <nav aria-label={t("mainNavigation")} className="sidebar-scroll flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5">
          {visible.map((route) => {
            const isActive = pathname === route.href || pathname.startsWith(`${route.href}/`);
            return (
              <div key={route.href} className={route.href === "/settings" ? "mt-5! border-t border-white/10 pt-3" : undefined}>
                {route.href === "/settings" && <p className="px-4 pb-2 pt-2 text-xs font-medium text-white/50">{t("workspace")}</p>}
                {route.href === "/event-types" && <p className="px-4 pb-2 pt-5 text-xs font-medium text-white/35">{t("scheduling")}</p>}
                {route.href === "/time" && <p className="px-4 pb-2 pt-5 text-xs font-medium text-white/35">{t("timeInvoicing")}</p>}
                <Link
                  href={route.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ease-out",
                    isActive ? "text-white" : "text-white/55 hover:text-white"
                  )}
                >
                  {isActive && (
                    <>
                      <span className="absolute inset-0 rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_6px_20px_-10px_rgba(0,0,0,0.6)]" />
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[linear-gradient(180deg,hsl(var(--aurora-2)),hsl(var(--aurora-1)))] shadow-[0_0_12px_hsl(var(--aurora-1))]" />
                    </>
                  )}

                  {!isActive && (
                    <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 bg-white/[0.05] transition-opacity duration-300" />
                  )}

                  <route.icon
                    className={cn(
                      "relative z-10 h-[18px] w-[18px] transition-colors duration-300",
                      isActive
                        ? "text-white"
                        : "text-white/45 group-hover:text-white/85"
                    )}
                  />
                  <span className="relative z-10">{t(route.label)}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="px-6 pt-5">
          <div className="h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <div className="pt-5 pl-12 text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
            v1.0
          </div>
        </div>
      </div>
    </div>
  );
}
