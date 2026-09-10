"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, CalendarDays, Check, Link2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "timeiq.onboarding.dismissed";

interface Step {
  key: string;
  title: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
}

/**
 * Three-step setup card for new accounts. Reads completion from the same
 * endpoints the pages use and hides itself once everything is done or the
 * user dismisses it.
 */
export function OnboardingChecklist() {
  const { getToken } = useAuth();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    (async () => {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [eventTypes, calendars, clients] = await Promise.all([
          apiFetch<unknown[]>("/api/event-types", { headers }),
          apiFetch<unknown[]>("/api/calendars", { headers }),
          apiFetch<unknown[]>("/api/clients", { headers }),
        ]);
        setSteps([
          {
            key: "event-type",
            title: "Create an event type",
            desc: "A 30-minute intro call is a good first one. Your booking link goes live with it.",
            href: "/event-types",
            icon: Link2,
            done: eventTypes.length > 0,
          },
          {
            key: "calendar",
            title: "Connect your calendar",
            desc: "Google or any ICS feed, so bookings only land in free slots.",
            href: "/calendars",
            icon: CalendarDays,
            done: calendars.length > 0,
          },
          {
            key: "client",
            title: "Add your first client",
            desc: "Set a rate, log hours on the timesheet, and invoice in one click.",
            href: "/clients",
            icon: Users,
            done: clients.length > 0,
          },
        ]);
      } catch {
        setSteps(null);
      }
    })();
  }, [getToken]);

  if (!steps || dismissed) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <div className="glass glass-chroma rounded-[1.5rem] p-6 sm:p-7 relative">
      <button
        type="button"
        aria-label="Dismiss setup checklist"
        onClick={dismiss}
        className="absolute top-4 right-4 h-8 w-8 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Getting set up · {doneCount} of {steps.length}
          </div>
          <h2 className="font-display text-2xl tracking-[-0.02em]">Three steps to your first booking and invoice.</h2>
        </div>
        <Button asChild>
          <Link href={next.href}>
            {next.title}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden mb-6">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--aurora-5)),hsl(var(--aurora-1)),hsl(var(--aurora-4)))] transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={cn(
                "flex gap-3 rounded-xl border p-4 transition-colors h-full",
                s.done ? "border-transparent bg-foreground/[0.03] opacity-70" : "border-foreground/10 bg-background/60 hover:border-foreground/25"
              )}
            >
              <div
                className={cn(
                  "h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-semibold",
                  s.done ? "bg-[hsl(var(--aurora-4))] text-white" : "bg-primary text-primary-foreground"
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className="min-w-0">
                <div className={cn("font-semibold text-sm", s.done && "line-through")}>{s.title}</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
