"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { ArrowUp, Mic, RotateCcw, Square } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";
import { listen, speechRecognizer, takePendingAsk, type Recognizer } from "@/lib/speech";

// Anthropic-format history, kept as the server returns it so tool results carry over between turns.
type Block = { type: string; text?: string; name?: string; [k: string]: unknown };
type Message = { role: "user" | "assistant"; content: string | Block[] };
type Step = { tool: string; ok: boolean };
type Turn = { role: "user" | "assistant"; text: string; steps?: Step[] };

const STORE = "timeiq-assistant-v1";
const noop = () => () => {};
// Keys in the "assistant" messages; "paste" fills the box instead of sending.
const SUGGESTIONS = ["freeThisWeek", "tomorrow", "findTime", "paste"] as const;

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
  const t = useTranslations("assistant");
  const { getToken } = useAuth();
  const [history, setHistory] = useState<Message[]>(() => saved().history);
  const [steps, setSteps] = useState<Step[][]>(() => saved().steps);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const canListen = useSyncExternalStore(noop, () => Boolean(speechRecognizer()), () => false);
  const recognizer = useRef<Recognizer | null>(null);
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
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }, [busy, getToken, history, t]);

  // A request typed on the homepage before signing up: ask it now.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const pending = takePendingAsk();
    // after this render, so the effect itself never sets state
    if (pending) setTimeout(() => void send(pending), 0);
  }, [send]);

  function toggleMic() {
    if (listening) { recognizer.current?.stop(); return; }
    recognizer.current = listen(
      draft,
      setDraft,
      () => { setListening(false); recognizer.current = null; input.current?.focus(); },
      (error) => { if (error === "not-allowed") setError(t("micBlocked")); },
    );
    if (recognizer.current) setListening(true);
  }

  function reset() {
    recognizer.current?.stop();
    setHistory([]); setSteps([]); setDraft(""); setError(null);
  }

  const turns = turnsFrom(history, steps);
  const empty = turns.length === 0;

  return (
    <section aria-label={t("title")} className="rounded-2xl border bg-card shadow-sm">
      <div className={cn("px-5 sm:px-7", empty ? "pt-7 pb-2" : "pt-5")}>
        {empty ? (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {firstName ? t("headingName", { name: firstName }) : t("heading")}
            </h2>
            <p className="mt-1.5 text-muted-foreground">
              {t("intro")}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{t("title")}</p>
            <button type="button" onClick={reset} disabled={busy} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> {t("newChat")}
            </button>
          </div>
        )}
      </div>

      {!empty && (
        <div className="max-h-[56vh] overflow-y-auto px-5 sm:px-7 py-4 space-y-5" aria-live="polite">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background">{turn.text}</p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <LogoMark className="mt-0.5 h-7 w-7 shrink-0 text-foreground" />
                <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
                  {turn.steps && turn.steps.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {[...new Set(turn.steps.map((s) => s.tool))].map((tool) => (
                        <span key={tool} className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {t.has(`steps.${tool}` as Parameters<typeof t>[0]) ? t(`steps.${tool}` as Parameters<typeof t>[0]) : tool.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  )}
                  <Reply text={turn.text} />
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <LogoMark className="h-7 w-7 shrink-0 text-foreground animate-pulse" />
              <span className="text-sm">{t("working")}</span>
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
            placeholder={listening ? t("listening") : t("placeholder")}
            aria-label={t("messageLabel")}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? t("stopListening") : t("talk")}
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
            aria-label={t("send")}
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
                onClick={() => (s === "paste" ? (setDraft(`${t("pastePrefix")}\n`), input.current?.focus()) : send(t(`suggestions.${s}`)))}
                className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
              >
                {t(`suggestions.${s}`)}
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
