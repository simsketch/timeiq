"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCircle2, Loader2, Paperclip, Plus, RotateCcw, Send, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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

// The three suggested starts (EST), each a 30-minute slot.
const STARTS = ["2026-11-02T09:00:00-05:00", "2026-11-03T10:30:00-05:00", "2026-11-04T11:00:00-05:00"];
const ZONE = "America/New_York";

function Bubble({ m }: { m: Msg }) {
  const t = useTranslations("landing.demo.cc");
  return (
    <div className={`demo-pop rounded-2xl border px-4 py-3 text-sm ${m.agent ? "border-[hsl(var(--aurora-1))]/25 bg-[hsl(var(--aurora-1))]/[0.05]" : "border-foreground/[0.08] bg-white/85"}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className={`font-semibold ${m.agent ? "text-[hsl(var(--aurora-1))]" : "text-foreground/80"}`}>
          {m.agent && <CalendarCheck className="mr-1 inline h-3 w-3" />}
          {m.from}
        </span>
        <span className="truncate">{t("to", { names: m.to })}</span>
      </div>
      <div className="leading-relaxed text-foreground/85">{m.body}</div>
    </div>
  );
}

function Typing() {
  const t = useTranslations("landing.demo.cc");
  return (
    <div className="demo-fade inline-flex items-center gap-2 rounded-full border border-[hsl(var(--aurora-1))]/20 bg-white/70 px-3 py-1.5 text-xs text-[hsl(var(--aurora-1))]">
      <Loader2 className="h-3 w-3 animate-spin" /> {t("typing")}
    </div>
  );
}

/** Homepage demo: cc TimeIQ on a thread and watch it schedule the meeting. */
export function CcTimeiqDemo() {
  const t = useTranslations("landing.demo.cc");
  const demo = useTranslations("landing.demo");
  const locale = useLocale();
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: ZONE }).format(new Date(iso));
  const TIMES = STARTS.map((iso) => fmt(iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
  const ends = STARTS.map((iso) => fmt(new Date(new Date(iso).getTime() + 30 * 60_000).toISOString(), { hour: "numeric", minute: "2-digit" }));
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
        from: t("danaYou"),
        to: cc ? t("elonCc") : "Elon",
        body: t("ask"),
      });
    if (step >= 2)
      thread.push({
        id: "proposal",
        from: t("elonVia"),
        to: "Dana, Elon",
        agent: true,
        body: (
          <>
            {t("proposal")}
            <div className="mt-2 grid gap-1.5">
              {TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  disabled={step !== 2}
                  onClick={() => {
                    setPicked(time);
                    advance(3);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-all ${
                    picked === time
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/10 bg-white hover:-translate-y-0.5 hover:border-[hsl(var(--aurora-1))]/50 disabled:hover:translate-y-0"
                  } ${step === 2 ? "ring-2 ring-[hsl(var(--aurora-1))]/0 hover:ring-[hsl(var(--aurora-1))]/20" : ""}`}
                >
                  {time} EST
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground underline underline-offset-2">{t("noneWork")}</div>
          </>
        ),
      });
    if (step >= 3) thread.push({ id: "reply", from: t("danaYou"), to: "TimeIQ, Elon", body: t("works", { time: picked ?? "" }) });
    if (step >= 4)
      thread.push({
        id: "note",
        from: t("elonVia"),
        to: "Elon",
        agent: true,
        body: <>{t.rich("answered", { time: picked ?? "", b: (chunks) => <strong>{chunks}</strong> })}</>,
      });
    if (step >= 5) thread.push({ id: "book", from: "Elon", to: "TimeIQ", body: t("bookThanks") });
    if (step >= 6)
      thread.push({
        id: "booked",
        from: t("elonVia"),
        to: "Dana, Elon",
        agent: true,
        body: (
          <>
            {t.rich("booked", {
              start: picked ?? "",
              end: ends[Math.max(0, TIMES.indexOf(picked ?? ""))],
              b: (chunks) => <strong>{chunks}</strong>,
            })}
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-white px-3 py-1.5 text-xs font-medium">
              <Paperclip className="h-3.5 w-3.5" /> invite.ics
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <CalendarCheck className="h-3.5 w-3.5" /> {t("bothCalendars")}
              </span>
            </div>
          </>
        ),
      });
  } else {
    if (step >= 1)
      thread.push({
        id: "luna",
        from: t("luna"),
        to: t("elonCc"),
        body: (
          <>
            {t("lunaAsk")}
            <ul className="mt-1.5 space-y-0.5">
              <li className={step >= 2 ? "text-muted-foreground line-through" : ""}>{t("luna1")}</li>
              <li className={step >= 2 ? "font-semibold text-emerald-700" : ""}>{t("luna2")}</li>
              <li>{t("luna3")}</li>
            </ul>
          </>
        ),
      });
    if (step >= 2)
      thread.push({
        id: "accept",
        from: t("elonVia"),
        to: "Luna, Elon",
        agent: true,
        body: (
          <>
            {t.rich("accept", { b: (chunks) => <strong>{chunks}</strong> })}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-rose-800">
                <X className="h-3 w-3" /> {t("busyChip")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> {t("freeChip")}
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
        <div className="flex rounded-lg bg-foreground/[0.05] p-0.5" role="tablist" aria-label={t("tabs")}>
          {(
            [
              ["thread", t("tabThread")],
              ["assistant", t("tabAssistant")],
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
          <RotateCcw className="h-3 w-3" /> {demo("reset")}
        </button>
      </div>

      <div ref={list} className="h-[460px] space-y-3 overflow-y-auto pr-1" aria-live={autoplaying ? "off" : "polite"}>
        {step === 0 && mode === "thread" && (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-white/70 px-4 py-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{t("toElon")}</span>
              {cc ? (
                <span className="demo-pop inline-flex items-center gap-1 rounded-full bg-[hsl(var(--aurora-1))]/10 px-2 py-0.5 font-medium text-[hsl(var(--aurora-1))]">
                  Cc: agent@timeiq.app
                  <button type="button" aria-label={t("removeCc")} onClick={() => setCc(false)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setCc(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--aurora-1))]/40 px-2 py-0.5 font-medium text-[hsl(var(--aurora-1))] hover:bg-[hsl(var(--aurora-1))]/10"
                >
                  <Plus className="h-3 w-3" /> {t("ccButton")}
                </button>
              )}
            </div>
            <p className="text-foreground/85">{t("ask")}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{cc ? t("ready") : t("addFirst")}</span>
              <button
                type="button"
                disabled={!cc}
                onClick={() => advance(1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,hsl(var(--aurora-1)),hsl(var(--aurora-5)))] px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
              >
                <Send className="h-3 w-3" /> {t("send")}
              </button>
            </div>
          </div>
        )}
        {step === 0 && mode === "assistant" && (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-white/70 px-4 py-4 text-sm">
            <p className="text-foreground/85">
              {t("recruiter")}
            </p>
            <button
              type="button"
              onClick={() => advance(1)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,hsl(var(--aurora-1)),hsl(var(--aurora-5)))] px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5"
            >
              <Send className="h-3 w-3" /> {t("showLuna")}
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
          <span className="text-xs text-muted-foreground">{t("youreDana")}</span>
        )}
        {mode === "thread" && step === 4 && !typing && (
          <button
            type="button"
            onClick={() => advance(5)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background shadow-md hover:-translate-y-0.5 transition-transform"
          >
            {t("replyAsElon")}
          </button>
        )}
        {done && (
          <span className="demo-pop inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {mode === "thread" ? t("doneThread") : t("doneAssistant")}
          </span>
        )}
      </div>
    </div>
  );
}
