// The browser's own speech recognition (Chrome, Edge, Safari). Not in TypeScript's DOM types yet.
export type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function speechRecognizer(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => Recognizer) | null;
}

/** Listen and report the running transcript (final + interim) appended to `base`. */
export function listen(base: string, onText: (text: string) => void, onEnd: () => void, onError?: (error: string) => void): Recognizer | null {
  const Rec = speechRecognizer();
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = navigator.language || "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  const prefix = base ? `${base.trimEnd()} ` : "";
  rec.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    onText(prefix + text);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = onEnd;
  rec.start();
  return rec;
}

// A request typed on the homepage, carried through sign-up to the dashboard's chat.
export const PENDING_ASK = "timeiq-pending-ask";

export function savePendingAsk(text: string) {
  try { localStorage.setItem(PENDING_ASK, JSON.stringify({ text, at: Date.now() })); } catch { /* storage blocked */ }
}

/** The pending request if it's under an hour old; clears it either way. */
export function takePendingAsk(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_ASK);
    localStorage.removeItem(PENDING_ASK);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p.text === "string" && Date.now() - p.at < 3_600_000 ? p.text : null;
  } catch {
    return null;
  }
}
