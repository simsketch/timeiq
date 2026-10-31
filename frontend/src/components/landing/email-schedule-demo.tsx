"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, Mail, RotateCcw, Send, Undo2 } from "lucide-react";
import { MiniWeek } from "./mini-week";
import { DEMO_CALENDARS, MERGE_EVENTS, clock, dayDate, type DemoEvent } from "./demo-week";
import { useDemoAutoplay } from "./use-demo-autoplay";

const KIDS = DEMO_CALENDARS.find((c) => c.key === "school")!.color;

interface Sample {
  key: string;
  chip: string;
  from: string;
  subject: string;
  attachment: string;
  kind: "pdf" | "email" | "image";
  events: Omit<DemoEvent, "color">[];
}

const SAMPLES: Sample[] = [
  {
    key: "soccer",
    chip: "Soccer PDF",
    from: "Coach Dana",
    subject: "Fw: U10 fall soccer schedule",
    attachment: "U10-fall-schedule.pdf",
    kind: "pdf",
    events: [
      { id: "soc1", day: 1, start: 17.5, end: 19, title: "Soccer practice" },
      { id: "soc2", day: 3, start: 17.5, end: 19, title: "Soccer practice" },
      { id: "soc3", day: 5, start: 9, end: 10.5, title: "Game vs Cazenovia" },
      { id: "soc4", day: 6, start: 0, end: 24, title: "Tournament", allDay: true },
    ],
  },
  {
    key: "band",
    chip: "Band email",
    from: "Mr. Patel",
    subject: "Fw: Concert week, please read",
    attachment: "Pasted in the email body",
    kind: "email",
    events: [
      { id: "band1", day: 0, start: 18, end: 19.5, title: "Band rehearsal" },
      { id: "band2", day: 2, start: 18, end: 19.5, title: "Band rehearsal" },
      { id: "band3", day: 4, start: 18.5, end: 20, title: "Winter concert" },
    ],
  },
  {
    key: "dance",
    chip: "Team app screenshot",
    from: "You",
    subject: "Dance this week",
    attachment: "IMG_2041.png",
    kind: "image",
    events: [
      { id: "dan1", day: 2, start: 16.5, end: 17.5, title: "Dance class" },
      { id: "dan2", day: 5, start: 13, end: 15, title: "Dress rehearsal" },
      { id: "dan3", day: 6, start: 14, end: 16, title: "Recital" },
    ],
  },
];

const BASE: DemoEvent[] = MERGE_EVENTS.work.map((e) => ({ ...e, color: "hsl(232 20% 70%)" }));

type Phase = "ready" | "sending" | "reading" | "added" | "undone";

// Autoplay: send each sample in turn, undo the last one, then start over.
const AUTOPLAY: ({ send: number } | { pick: number } | "undo" | "reset")[] = [
  { send: 0 },
  { pick: 1 },
  { send: 1 },
  { pick: 2 },
  { send: 2 },
  "undo",
  "reset",
];

/** Hero demo: send a schedule to TimeIQ and watch it land on the calendar. */
export function EmailScheduleDemo() {
  const [sampleKey, setSampleKey] = useState(SAMPLES[0].key);
  const [phase, setPhase] = useState<Phase>("ready");
  const [added, setAdded] = useState<Record<string, DemoEvent[]>>({});
  const [last, setLast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const sample = SAMPLES.find((s) => s.key === sampleKey)!;
  const busy = phase === "sending" || phase === "reading";

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function send(s: Sample) {
    if (added[s.key]) return;
    setPhase("sending");
    later(() => setPhase("reading"), 550);
    later(() => {
      setAdded((prev) => ({ ...prev, [s.key]: s.events.map((e) => ({ ...e, color: KIDS })) }));
      setLast(s.key);
      setPhase("added");
    }, 1650);
  }

  function undo() {
    if (!last) return;
    setAdded((prev) => {
      const next = { ...prev };
      delete next[last];
      return next;
    });
    setPhase("undone");
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAdded({});
    setLast(null);
    setPhase("ready");
    setSampleKey(SAMPLES[0].key);
  }

  function pick(key: string) {
    if (busy) return;
    setSampleKey(key);
    setPhase("ready");
  }

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // The hero plays itself, starting soon after load, until the visitor takes over.
  const autoStep = useRef(0);
  const { ref, active: autoplaying } = useDemoAutoplay(
    () => {
      if (busy) return 600;
      const action = AUTOPLAY[autoStep.current++ % AUTOPLAY.length];
      if (action === "undo") undo();
      else if (action === "reset") reset();
      else if ("pick" in action) pick(SAMPLES[action.pick].key);
      else send(SAMPLES[action.send]);
    },
    { firstDelay: 1400 },
  );

  const events = [...BASE, ...Object.values(added).flat()];
  const fresh = new Set(last && phase === "added" ? (added[last] ?? []).map((e) => e.id) : []);
  const lastSample = SAMPLES.find((s) => s.key === last);
  const alreadySent = Boolean(added[sample.key]);
  const Icon = sample.kind === "pdf" ? FileText : sample.kind === "image" ? ImageIcon : Mail;

  return (
    <div ref={ref} className="glass glass-chroma rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--aurora-1))]">
          Try it · no signup
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label="Sample schedule">
        {SAMPLES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={s.key === sampleKey}
            onClick={() => pick(s.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              s.key === sampleKey
                ? "bg-foreground text-background shadow-sm"
                : "bg-foreground/[0.05] text-foreground/75 hover:bg-foreground/[0.09]"
            }`}
          >
            {added[s.key] && <CheckCircle2 className="h-3 w-3" />}
            {s.chip}
          </button>
        ))}
      </div>

      {/* The email being sent */}
      <div className="relative mb-4 min-h-[92px]">
        <div
          key={`${sample.key}-${phase === "sending" ? "out" : "in"}`}
          className={`rounded-xl border border-foreground/[0.08] bg-white/80 px-3.5 py-3 text-sm ${
            phase === "sending" ? "demo-send" : "demo-pop"
          } ${phase === "reading" ? "invisible" : ""}`}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="truncate">To: agent@timeiq.app</span>
            <span className="shrink-0">From: {sample.from}</span>
          </div>
          <div className="mt-1 font-medium truncate">{sample.subject}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{sample.attachment}</span>
            </span>
            <button
              type="button"
              disabled={busy || alreadySent}
              onClick={() => send(sample)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,hsl(var(--aurora-1)),hsl(var(--aurora-5)))] px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-[hsl(var(--aurora-1))]/25 transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {alreadySent ? "Added" : <><Send className="h-3 w-3" /> Send to TimeIQ</>}
            </button>
          </div>
        </div>
        {phase === "reading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[hsl(var(--aurora-1))]/40 bg-[hsl(var(--aurora-1))]/[0.04] text-sm text-[hsl(var(--aurora-1))] demo-fade">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading the schedule…
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white/60 p-2.5 sm:p-3 ring-1 ring-foreground/[0.05]">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: "hsl(232 20% 70%)" }} /> Your week
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: KIDS }} /> From email
          </span>
        </div>
        <MiniWeek days={7} from={8} to={21} events={events} fresh={fresh} hourHeight={17} reserveAllDay />
      </div>

      {/* The reply TimeIQ sends back */}
      <div aria-live={autoplaying ? "off" : "polite"} className="min-h-[101px] mt-3">
        {phase === "added" && lastSample && (
          <div className="demo-pop rounded-xl border border-emerald-500/20 bg-emerald-50/80 px-3.5 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Reply: added {lastSample.events.length} events
              </span>
              <button
                type="button"
                onClick={undo}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-600/10"
              >
                <Undo2 className="h-3 w-3" /> Undo
              </button>
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-[11px] text-emerald-900/75 tabular-nums">
              {lastSample.events.slice(0, 3).map((e) => (
                <div key={e.id} className="truncate">
                  {dayDate(e.day)} · {e.title}
                  {e.allDay ? " (all day)" : `, ${clock(e.start)}`}
                </div>
              ))}
            </div>
          </div>
        )}
        {phase === "undone" && (
          <div className="demo-pop rounded-xl border border-foreground/[0.08] bg-white/70 px-3.5 py-2.5 text-sm text-muted-foreground">
            Removed those events. Nothing else on your calendar changed. Pick another sample to try again.
          </div>
        )}
        {phase === "ready" && Object.keys(added).length === 0 && (
          <div className="px-1 pt-2 text-xs text-muted-foreground">
            Pick a sample, hit Send, and watch it land on the week. The real thing replies within a minute.
          </div>
        )}
      </div>
    </div>
  );
}
