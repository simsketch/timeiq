"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { hasSessionCookie } from "@/lib/session-cookie";
import { listen, savePendingAsk, speechRecognizer, type Recognizer } from "@/lib/speech";

// The homepage's ask box. Nothing is sent from here: the request rides through
// sign-up (or straight to the dashboard when signed in) and Ask TimeIQ answers it there.
const EXAMPLES = [
  "Find 30 minutes with sam@acme.com next week",
  "When am I free Thursday afternoon?",
  "Set up a call with Priya, Dev and Marco, mornings only",
  "Add soccer practice: Saturdays 9am at Lincoln Park until December",
  "What does my week look like?",
];
const noop = () => () => {};
const CHIPS = ["What does my week look like?", "Find 30 min with a client next week", "Add my kid's soccer schedule"];

export function HeroAsk() {
  const [text, setText] = useState("");
  const [placeholder, setPlaceholder] = useState(EXAMPLES[0]);
  const [listening, setListening] = useState(false);
  // false on the server and in browsers without speech recognition, so hydration matches
  const canListen = useSyncExternalStore(noop, () => Boolean(speechRecognizer()), () => false);
  const rec = useRef<Recognizer | null>(null);
  const box = useRef<HTMLInputElement>(null);

  // Type the examples out one by one, while the box is empty and the tab is visible.
  useEffect(() => {
    if (text || listening || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ex = 0, ch = EXAMPLES[0].length, deleting = true, t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (document.hidden || document.activeElement === box.current) { t = setTimeout(tick, 600); return; }
      const word = EXAMPLES[ex];
      if (deleting) {
        ch = Math.max(0, ch - 2);
        if (ch === 0) { deleting = false; ex = (ex + 1) % EXAMPLES.length; }
      } else {
        ch = Math.min(EXAMPLES[ex].length, ch + 1);
      }
      setPlaceholder((deleting ? word : EXAMPLES[ex]).slice(0, ch) || " ");
      const done = !deleting && ch === EXAMPLES[ex].length;
      if (done) deleting = true;
      t = setTimeout(tick, done ? 2400 : deleting ? 18 : 42);
    };
    t = setTimeout(tick, 2600);
    return () => clearTimeout(t);
  }, [text, listening]);

  function go(request: string) {
    const ask = request.trim();
    if (!ask) { box.current?.focus(); return; }
    rec.current?.stop();
    savePendingAsk(ask);
    window.location.href = hasSessionCookie() ? "/dashboard" : "/sign-up";
  }

  function toggleMic() {
    if (listening) { rec.current?.stop(); return; }
    rec.current = listen(text, setText, () => { setListening(false); rec.current = null; });
    if (rec.current) setListening(true);
  }

  return (
    <div className="mt-5 w-full max-w-[29rem] sm:mt-7">
      <form
        onSubmit={(e) => { e.preventDefault(); go(text); }}
        className={`flex items-center gap-1.5 rounded-2xl border bg-white/85 p-1.5 pl-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur transition ${listening ? "border-[#f2690d] ring-2 ring-[#f2690d]/25" : "border-black/10 focus-within:border-black/30"}`}
      >
        <input
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? "Listening…" : placeholder}
          aria-label="Ask TimeIQ to schedule something"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-[#141414] outline-none placeholder:text-black/45"
        />
        {canListen && (
          <button type="button" onClick={toggleMic} aria-label={listening ? "Stop listening" : "Say it instead"} aria-pressed={listening}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${listening ? "bg-[#f2690d] text-white" : "text-black/55 hover:bg-black/5 hover:text-black"}`}>
            {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <button type="submit" aria-label="Ask TimeIQ" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#141414] text-white transition hover:bg-black">
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {CHIPS.map((c) => (
          <button key={c} type="button" onClick={() => go(c)}
            className="shrink-0 rounded-full border border-black/10 bg-white/55 px-3 py-1.5 text-[13px] text-black/70 backdrop-blur transition hover:bg-white/85 hover:text-black">
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
