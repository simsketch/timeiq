"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "@/components/dashboard/sidebar";
import { LogoIcon } from "@/components/logo";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 glass rounded-none border-b border-white/20">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-base font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <div className="flex items-center gap-3">
          <UserButton afterSignOutUrl="/" />
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-foreground/10 bg-background/60 text-foreground/80 hover:text-foreground hover:border-foreground/20 transition"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-[86%] max-w-[320px] p-3 transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-hidden={!open}
      >
        <div className="relative h-full">
          <Sidebar />
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute top-5 right-5 z-20 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute bottom-7 left-7 z-20">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </aside>
    </>
  );
}
