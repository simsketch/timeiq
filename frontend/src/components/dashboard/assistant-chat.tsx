"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ArrowUp, Mic, RotateCcw, Square } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

// Anthropic-format history, kept as the server returns it so tool results carry over between turns.
type Block = { type: string; text?: string; name?: string; [k: string]: unknown };
type Message = { role: "user" | "assistant"; content: string | Block[] };
type Step = { tool: string; ok: boolean };
type Turn = { role: "user" | "assistant"; text: string; steps?: Step[] };

const STORE = "timeiq-assistant-v1";
const SUGGESTIONS = [
  "When am I free this week?",
  "What's on my calendar tomorrow?",
  "Find 30 minutes with someone next week",
  "Add a schedule I paste in",
];
const STEP_LABEL: Record<string, string> = {
  get_profile: "Read your profile",
  get_free_times: "Checked your free time",
  list_calendar_events: "Read your calendar",
  list_calendars: "Looked at your calendars",
  sync_calendars: "Synced your calendars",
  add_calendar: "Added a calendar",
  list_event_types: "Looked at your event types",
  list_bookings: "Looked at your bookings",
  cancel_booking: "Cancelled a booking",
  find_time_with: "Sent a find-a-time invite",
  list_group_meetings: "Looked at group meetings",
  get_group_meeting: "Checked a group meeting",
  book_group_meeting: "Booked the meeting",
  remind_group_meeting: "Sent reminders",
  cancel_group_meeting: "Cancelled a group meeting",
  import_schedule_text: "Imported the schedule",
  get_schedule_email_address: "Found your schedule email",
};

/** The visible conversation: user text, and each assistant reply with the tools it used. */
function turnsFrom(history: Message[], stepsByReply: Step[][]): Turn[] {
  const turns: Turn[] = [];
  let reply = 0;
  history.forEach((m, i) => {
    if (m.role === "user" && typeof m.content === "string") turns.push({ role: "user", text: m.content });
    const next = history[i + 1];
    const endsTurn = m.role === "assistant" && (!next || (next.role === "user" && typeof next.content === "string"));
    if (endsTurn && Array.isArray(m.content)) {
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      turns.push({ role: "assistant", text, steps: stepsByReply[reply++] });
    }
  });
  return turns;
}

/** Light formatting for replies: paragraphs, "- " bullets and **bold**. */
function Reply({ text }: { text: string }) {
  const bold = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part,
    );
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={b} className="space-y-1 pl-4 list-disc marker:text-[hsl(var(--brand))]">
              {lines.map((l, i) => <li key={i}>{bold(l.replace(/^\s*[-•]\s+/, ""), `${b}-${i}`)}</li>)}
            </ul>
          );
        }
        return <p key={b}>{lines.map((l, i) => <span key={i}>{i > 0 && <br />}{bold(l, `${b}-${i}`)}</span>)}</p>;
      })}
    </div>
  );
}

// The browser's own speech recognition (Chrome, Edge, Safari). Not in TypeScript's DOM types yet.
type Recognizer = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
function speechRecognizer(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => Recognizer) | null;
}

function saved(): { history: Message[]; steps: Step[][] } {
  // Kept for this tab, so a reload or a trip to Calendars doesn't lose the conversation.
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) || "null");
    if (Array.isArray(s?.history)) return { history: s.history, steps: Array.isArray(s.steps) ? s.steps : [] };
  } catch { /* storage blocked: start fresh */ }
  return { history: [], steps: [] };
}

// Rendered only in the browser: the dashboard shows a loader until its data arrives.
export function AssistantChat({ firstName }: { firstName?: string | null }) {
  const { getToken } = useAuth();
  const [history, setHistory] = useState<Message[]>(() => saved().history);
  const [steps, setSteps] = useState<Step[][]>(() => saved().steps);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canListen] = useState(() => Boolean(speechRecognizer()));
  const recognizer = useRef<Recognizer | null>(null);
  const spokenBase = useRef("");
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ history, steps })); } catch { /* ignore */ }
    if (history.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [history, steps]);

  // Grow the box with what's typed or said.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    recognizer.current?.stop();
    const next: Message[] = [...history, { role: "user", content: message }];
    setHistory(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const token = await getToken();
      const res = await apiFetch<{ messages: Message[]; steps: Step[] }>("/api/me/assistant", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next }),
      });
      setHistory(res.messages);
      setSteps((s) => [...s, res.steps]);
    } catch (e) {
      setHistory(history);
      setDraft(message);
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, getToken, history]);

  function toggleMic() {
    if (listening) { recognizer.current?.stop(); return; }
    const Rec = speechRecognizer();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    spokenBase.current = draft ? `${draft.trimEnd()} ` : "";
    rec.onresult = (e) => {
      let finalText = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      setDraft(spokenBase.current + finalText + interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone access is blocked. Allow it in your browser to talk to TimeIQ.");
    };
    rec.onend = () => { setListening(false); recognizer.current = null; input.current?.focus(); };
    recognizer.current = rec;
    setListening(true);
    rec.start();
  }

  function reset() {
    recognizer.current?.stop();
    setHistory([]); setSteps([]); setDraft(""); setError(null);
  }

  const turns = turnsFrom(history, steps);
  const empty = turns.length === 0;

  return (
    <section aria-label="Ask TimeIQ" className="rounded-2xl border bg-card shadow-sm">
      <div className={cn("px-5 sm:px-7", empty ? "pt-7 pb-2" : "pt-5")}>
        {empty ? (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              What should we schedule{firstName ? `, ${firstName}` : ""}?
            </h2>
            <p className="mt-1.5 text-muted-foreground">
              Ask about your week, find time with people, or paste a schedule. Type it or say it.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Ask TimeIQ</p>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> New chat
            </button>
          </div>
        )}
      </div>

      {!empty && (
        <div className="max-h-[56vh] overflow-y-auto px-5 sm:px-7 py-4 space-y-5" aria-live="polite">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background">{t.text}</p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <LogoMark className="mt-0.5 h-7 w-7 shrink-0 text-foreground" />
                <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
                  {t.steps && t.steps.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {[...new Set(t.steps.map((s) => s.tool))].map((tool) => (
                        <span key={tool} className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {STEP_LABEL[tool] ?? tool.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  )}
                  <Reply text={t.text} />
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <LogoMark className="h-7 w-7 shrink-0 text-foreground animate-pulse" />
              <span className="text-sm">Working on it…</span>
            </div>
          )}
          <div ref={bottom} />
        </div>
      )}

      <form
        className="p-3 sm:p-4"
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
      >
        <div className={cn(
          "flex items-end gap-2 rounded-2xl border bg-background px-3 py-2 transition focus-within:border-foreground/40",
          listening && "border-[hsl(var(--brand))] ring-2 ring-[hsl(var(--brand)/0.2)]",
        )}>
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); }
            }}
            rows={1}
            placeholder={listening ? "Listening…" : "Find 30 minutes with Sam next week…"}
            aria-label="Message TimeIQ"
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? "Stop listening" : "Talk instead of typing"}
              aria-pressed={listening}
              className={cn(
                "mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
                listening ? "bg-[hsl(var(--brand))] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
        {error && <p role="alert" className="mt-2 px-1 text-sm text-red-600">{error}</p>}
        {empty && (
          <div className="mt-3 flex flex-wrap gap-2 px-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => (s.startsWith("Add a schedule") ? (setDraft("Add this schedule to my calendar:\n"), input.current?.focus()) : send(s))}
                className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
