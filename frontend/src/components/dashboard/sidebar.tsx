"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
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
import { LogoIcon } from "@/components/logo";

const routes = [
  { label: "Home", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Booking page", icon: Calendar, href: "/event-types" },
  { label: "Availability", icon: Clock, href: "/availability" },
  { label: "Calendars", icon: CalendarDays, href: "/calendars" },
  { label: "Bookings", icon: BookOpen, href: "/bookings" },
  { label: "Group meetings", icon: UsersRound, href: "/meetings" },
  { label: "Time", icon: Timer, href: "/time" },
  { label: "Clients", icon: Users, href: "/clients" },
  { label: "Invoices", icon: Receipt, href: "/invoices" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col rounded-[1.5rem] overflow-hidden aurora-bg-dark">
      <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_20px_60px_-20px_rgba(0,0,0,0.5)]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col py-7">
        <div className="px-6 mb-9">
          <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 group">
            <LogoIcon />
            <span className="text-lg font-semibold tracking-tight text-white">
              TimeIQ
            </span>
          </Link>
          <div className="mt-1 text-xs text-white/40">
            Workspace
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5">
          {routes.map((route) => {
            const isActive = pathname === route.href || pathname.startsWith(`${route.href}/`);
            return (
              <div key={route.href} className={route.href === "/settings" ? "mt-5! border-t border-white/10 pt-3" : undefined}>
                {route.href === "/event-types" && <p className="px-4 pb-2 pt-5 text-xs font-medium text-white/35">Scheduling</p>}
                {route.href === "/time" && <p className="px-4 pb-2 pt-5 text-xs font-medium text-white/35">Time &amp; invoicing</p>}
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
                  <span className="relative z-10">{route.label}</span>
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
