"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCircle2, Paperclip, Plus, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useDemoAutoplay } from "./use-demo-autoplay";

type Mode = "thread" | "assistant";

interface Msg {
  id: string;
  from: string;
  to: string;
  body: React.ReactNode;
  agent?: boolean;
  delay?: number;
}

const TIMES = ["Mon Nov 2, 9 AM", "Tue Nov 3, 10:30 AM", "Wed Nov 4, 11 AM"];

function Bubble({ m }: { m: Msg }) {
  return (
    <div className={`demo-pop rounded-2xl border px-4 py-3 text-sm ${m.agent ? "border-[hsl(var(--aurora-1))]/25 bg-[hsl(var(--aurora-1))]/[0.05]" : "border-foreground/[0.08] bg-white/85"}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className={`font-semibold ${m.agent ? "text-[hsl(var(--aurora-1))]" : "text-foreground/80"}`}>
          {m.agent && <Sparkles className="mr-1 inline h-3 w-3" />}
          {m.from}
        </span>
        <span className="truncate">to {m.to}</span>
      </div>
      <div className="leading-relaxed text-foreground/85">{m.body}</div>
    </div>
  );
}

function Typing() {
  return (
    <div className="demo-fade inline-flex items-center gap-2 rounded-full border border-[hsl(var(--aurora-1))]/20 bg-white/70 px-3 py-1.5 text-xs text-[hsl(var(--aurora-1))]">
      <Sparkles className="h-3 w-3 animate-pulse" /> TimeIQ is checking Elon&apos;s calendars…
    </div>
  );
}

/** Homepage demo: cc TimeIQ on a thread and watch it schedule the meeting. */
export function CcTimeiqDemo() {
  const [mode, setMode] = useState<Mode>("thread");
  const [cc, setCc] = useState(false);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const list = useRef<HTMLDivElement>(null);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function reset(next: Mode = mode) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMode(next);
    setCc(false);
    setStep(0);
    setTyping(false);
    setPicked(null);
  }

  // Each user action reveals the agent's answer after a short "thinking" beat.
  function advance(to: number) {
    setStep(to);
    setTyping(true);
    later(() => {
      setTyping(false);
      setStep(to + 1);
    }, 1100);
  }

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Autoplay walks the visitor's next move each step: cc TimeIQ, send, pick a
  // time, "book it", then the other tab, and around again.
  const rounds = useRef(0);
  const { ref, active: autoplaying } = useDemoAutoplay(() => {
    if (typing) return 600;
    if (mode === "thread") {
      if (step === 0 && !cc) setCc(true);
      else if (step === 0) advance(1);
      else if (step === 2) {
        setPicked(TIMES[rounds.current++ % TIMES.length]);
        advance(3);
      } else if (step === 4) advance(5);
      else if (step >= 6) reset("assistant");
    } else if (step === 0) advance(1);
    else if (step >= 2) reset("thread");
  });

  // Scroll only the thread itself; scrollIntoView also moved the page and dragged
  // visitors from the hero down to this demo on load.
  useEffect(() => {
    const el = list.current;
    if (el && step > 0) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [step, typing]);

  const thread: Msg[] = [];
  if (mode === "thread") {
    if (step >= 1)
      thread.push({
        id: "dana",
        from: "Dana (you)",
        to: cc ? "Elon, cc TimeIQ" : "Elon",
        body: "Could we find 30 minutes next week for the pilot kickoff? Mornings work best.",
      });
    if (step >= 2)
      thread.push({
        id: "proposal",
        from: "Elon via TimeIQ",
        to: "Dana, Elon",
        agent: true,
        body: (
          <>
            Hi Dana, here are 3 times that work for Elon. Tap one, or just reply:
            <div className="mt-2 grid gap-1.5">
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={step !== 2}
                  onClick={() => {
                    setPicked(t);
                    advance(3);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-all ${
                    picked === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/10 bg-white hover:-translate-y-0.5 hover:border-[hsl(var(--aurora-1))]/50 disabled:hover:translate-y-0"
                  } ${step === 2 ? "ring-2 ring-[hsl(var(--aurora-1))]/0 hover:ring-[hsl(var(--aurora-1))]/20" : ""}`}
                >
                  {t} EST
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground underline underline-offset-2">None of these work? Pick a different time</div>
          </>
        ),
      });
    if (step >= 3) thread.push({ id: "reply", from: "Dana (you)", to: "TimeIQ, Elon", body: `${picked} works for me!` });
    if (step >= 4)
      thread.push({
        id: "note",
        from: "Elon via TimeIQ",
        to: "Elon",
        agent: true,
        body: (
          <>
            Everyone has answered for <strong>Pilot kickoff</strong>. Dana can make {picked}. Reply &ldquo;book it&rdquo; and
            I&apos;ll send the invite.
          </>
        ),
      });
    if (step >= 5) thread.push({ id: "book", from: "Elon", to: "TimeIQ", body: "Book it, thanks!" });
    if (step >= 6)
      thread.push({
        id: "booked",
        from: "Elon via TimeIQ",
        to: "Dana, Elon",
        agent: true,
        body: (
          <>
            <strong>Pilot kickoff</strong> is booked for {picked}–{picked?.includes("10:30") ? "11 AM" : "30 min"} EST. The
            calendar invite is attached.
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-white px-3 py-1.5 text-xs font-medium">
              <Paperclip className="h-3.5 w-3.5" /> invite.ics
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <CalendarCheck className="h-3.5 w-3.5" /> on both calendars
              </span>
            </div>
          </>
        ),
      });
  } else {
    if (step >= 1)
      thread.push({
        id: "luna",
        from: "Luna, Acme's scheduler",
        to: "Elon, cc TimeIQ",
        body: (
          <>
            Please choose a time for your 45-minute interview:
            <ul className="mt-1.5 space-y-0.5">
              <li className={step >= 2 ? "text-muted-foreground line-through" : ""}>Mon Nov 2, 10 AM ET</li>
              <li className={step >= 2 ? "font-semibold text-emerald-700" : ""}>Tue Nov 3, 2 PM ET</li>
              <li>Wed Nov 4, 11 AM PT</li>
            </ul>
          </>
        ),
      });
    if (step >= 2)
      thread.push({
        id: "accept",
        from: "Elon via TimeIQ",
        to: "Luna, Elon",
        agent: true,
        body: (
          <>
            Hi Luna, I&apos;m TimeIQ, Elon&apos;s scheduling assistant. <strong>Tue Nov 3, 2 PM EST</strong> works for Elon.
            Please send the invite to elon@… I&apos;ve held the time on his calendar.
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-rose-800">
                <X className="h-3 w-3" /> Mon 10 AM: team standup
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> Tue 2 PM: free, held
              </span>
            </div>
          </>
        ),
      });
  }

  const done = mode === "thread" ? step >= 6 : step >= 2;

  return (
    <div ref={ref} className="glass rounded-[1.75rem] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg bg-foreground/[0.05] p-0.5" role="tablist" aria-label="Demo">
          {(
            [
              ["thread", "Find a time"],
              ["assistant", "Answer another assistant"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => reset(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === key ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => reset()} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div ref={list} className="h-[460px] space-y-3 overflow-y-auto pr-1" aria-live={autoplaying ? "off" : "polite"}>
        {step === 0 && mode === "thread" && (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-white/70 px-4 py-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>To: Elon</span>
              {cc ? (
                <span className="demo-pop inline-flex items-center gap-1 rounded-full bg-[hsl(var(--aurora-1))]/10 px-2 py-0.5 font-medium text-[hsl(var(--aurora-1))]">
                  Cc: agent@timeiq.app
                  <button type="button" aria-label="Remove TimeIQ" onClick={() => setCc(false)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setCc(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--aurora-1))]/40 px-2 py-0.5 font-medium text-[hsl(var(--aurora-1))] hover:bg-[hsl(var(--aurora-1))]/10"
                >
                  <Plus className="h-3 w-3" /> Cc TimeIQ
                </button>
              )}
            </div>
            <p className="text-foreground/85">Could we find 30 minutes next week for the pilot kickoff? Mornings work best.</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{cc ? "Ready. TimeIQ takes it from here." : "Add TimeIQ, then send."}</span>
              <button
                type="button"
                disabled={!cc}
                onClick={() => advance(1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,hsl(var(--aurora-1)),hsl(var(--aurora-5)))] px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
              >
                <Send className="h-3 w-3" /> Send
              </button>
            </div>
          </div>
        )}
        {step === 0 && mode === "assistant" && (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-white/70 px-4 py-4 text-sm">
            <p className="text-foreground/85">
              A recruiter&apos;s scheduling assistant offers three interview times. Elon is busy for one of them.
            </p>
            <button
              type="button"
              onClick={() => advance(1)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,hsl(var(--aurora-1)),hsl(var(--aurora-5)))] px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5"
            >
              <Send className="h-3 w-3" /> Show Luna&apos;s email
            </button>
          </div>
        )}
        {thread.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {typing && <Typing />}
      </div>

      <div className="mt-4 flex min-h-[40px] flex-wrap items-center gap-2">
        {mode === "thread" && step === 2 && !typing && (
          <span className="text-xs text-muted-foreground">You&apos;re Dana now. Tap the time that works.</span>
        )}
        {mode === "thread" && step === 4 && !typing && (
          <button
            type="button"
            onClick={() => advance(5)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background shadow-md hover:-translate-y-0.5 transition-transform"
          >
            Reply as Elon: &ldquo;Book it&rdquo;
          </button>
        )}
        {done && (
          <span className="demo-pop inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {mode === "thread" ? "Booked. Elon typed two words." : "Handled without Elon opening the email."}
          </span>
        )}
      </div>
    </div>
  );
}
