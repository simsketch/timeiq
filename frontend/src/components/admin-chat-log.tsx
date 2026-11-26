"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Block = { type: string; text?: string; name?: string; input?: unknown };
type Message = { role: string; content: string | Block[] };
type Turn = {
  created_at: string; prompt: string | null; reply: string | null; transcript: Message[] | null;
  input_tokens: number; output_tokens: number; name: string | null; email: string; username: string;
};

// One line per transcript block: what was said, and which tools ran with what inputs.
function lines(message: Message) {
  if (typeof message.content === "string") return [message.content];
  return message.content.flatMap((b) =>
    b.type === "text" ? [b.text ?? ""] : b.type === "tool_use" ? [`→ ${b.name} ${JSON.stringify(b.input)}`] : []);
}

export function AdminChatLog() {
  const { getToken } = useAuth();
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTurns(null); setError("");
      try {
        const token = await getToken();
        const data = await apiFetch<Turn[]>("/api/admin/chats", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!cancelled) setTurns(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load chats.");
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, getToken]);
  return (
    <section className="rounded-2xl border bg-background/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ask TimeIQ chats</h2>
          <p className="mt-1 text-sm text-muted-foreground">Newest 200 messages. Open one for the conversation up to that point, including the tools it called. What the tools returned (people&apos;s calendar data) isn&apos;t stored. Chats before Nov 26, 2026 have token counts only.</p>
        </div>
        <Button variant="outline" disabled={!turns && !error} onClick={() => setRefresh((n) => n + 1)}>Refresh</Button>
      </div>
      {!turns && !error && <p role="status" className="mt-4 text-sm">Loading chats…</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">{error}</p>}
      {turns?.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No chats yet.</p>}
      <ul className="mt-4 divide-y">
        {turns?.map((turn, i) => <li key={i} className="py-3">
          <details>
            <summary className="cursor-pointer list-none">
              <span className="text-xs text-muted-foreground">{new Date(turn.created_at).toLocaleString()} · {turn.name || turn.username} ({turn.email}) · {(turn.input_tokens + turn.output_tokens).toLocaleString()} tokens</span>
              <span className="mt-1 block font-medium">{turn.prompt ?? "(not recorded)"}</span>
              {turn.reply && <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{turn.reply}</span>}
            </summary>
            {turn.transcript && <div className="mt-3 space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
              {turn.transcript.map((m, j) => lines(m).map((line, k) => <p key={`${j}-${k}`} className={line.startsWith("→") ? "font-mono text-xs text-muted-foreground break-all" : "whitespace-pre-wrap"}>
                {k === 0 && !line.startsWith("→") && <strong className="mr-2 text-xs uppercase tracking-wide">{m.role === "user" ? "User" : "TimeIQ"}</strong>}{line}
              </p>))}
            </div>}
          </details>
        </li>)}
      </ul>
    </section>
  );
}
