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
} from "lucide-react";
import { LogoIcon } from "@/components/logo";

const routes = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Event Types", icon: Calendar, href: "/event-types" },
  { label: "Availability", icon: Clock, href: "/availability" },
  { label: "Calendars", icon: CalendarDays, href: "/calendars" },
  { label: "Bookings", icon: BookOpen, href: "/bookings" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="relative flex h-full w-full flex-col rounded-[1.5rem] overflow-hidden aurora-bg-dark">
      <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_20px_60px_-20px_rgba(0,0,0,0.5)]" />

      <div className="relative z-10 flex h-full flex-col py-7">
        <div className="px-6 mb-9">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <LogoIcon />
            <span className="text-lg font-semibold tracking-tight text-white">
              TimeIQ
            </span>
          </Link>
          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
            Workspace
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {routes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
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
