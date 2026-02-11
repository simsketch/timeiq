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
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    label: "Event Types",
    icon: Calendar,
    href: "/event-types",
  },
  {
    label: "Availability",
    icon: Clock,
    href: "/availability",
  },
  {
    label: "Calendars",
    icon: CalendarDays,
    href: "/calendars",
  },
  {
    label: "Bookings",
    icon: BookOpen,
    href: "/bookings",
  },
  {
    label: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="relative h-full overflow-hidden bg-gray-950">
      {/* Animated liquid glass blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="sidebar-blob sidebar-blob-1" />
        <div className="sidebar-blob sidebar-blob-2" />
        <div className="sidebar-blob sidebar-blob-3" />
      </div>

      {/* Glass overlay */}
      <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-3xl" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col py-6">
        <div className="px-6 mb-10">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <LogoIcon />
            <span className="text-xl font-bold text-white tracking-tight">TimeIQ</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {routes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "group relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {/* Active indicator — glass pill */}
                {isActive && (
                  <div className="absolute inset-0 rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
                )}

                {/* Hover glow */}
                {!isActive && (
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 bg-white/[0.04] transition-opacity duration-200" />
                )}

                <route.icon
                  className={cn(
                    "relative z-10 h-[18px] w-[18px] transition-colors duration-200",
                    isActive
                      ? "text-blue-400"
                      : "text-gray-500 group-hover:text-gray-300"
                  )}
                />
                <span className="relative z-10">{route.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom subtle separator */}
        <div className="px-6 pt-4">
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      </div>
    </div>
  );
}
