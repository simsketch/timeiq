"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImageIcon, Type } from "lucide-react";
import { buildText, drawImage, type AvailabilitySummary } from "@/lib/availability-share";
import { DEMO_MONDAY, DEMO_ZONE, MERGE_EVENTS, WORK_END, WORK_START, demoIso, freeWindows } from "./demo-week";

const EXTRA_ZONES = [
  { zone: "America/Los_Angeles", label: "Pacific" },
  { zone: "America/Chicago", label: "Central" },
  { zone: "Europe/London", label: "London" },
  { zone: "Asia/Tokyo", label: "Tokyo" },
];
const BOOKING_URL = "https://timeiq.app/book/you";
const MAX_EXTRA = 2;

/** The demo week as the dashboard's availability API would return it. */
function demoSummary(): AvailabilitySummary {
  const busy = Object.values(MERGE_EVENTS).flat();
  return {
    timezone: DEMO_ZONE,
    username: "you",
    days: [0, 1, 2, 3, 4].map((day) => {
      const date = new Date(`${DEMO_MONDAY}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + day);
      return {
        date: date.toISOString().slice(0, 10),
        working: true,
        work_start: `${String(WORK_START).padStart(2, "0")}:00`,
        work_end: `${WORK_END}:00`,
        windows: freeWindows(day, busy).map(([s, e]) => ({ start: demoIso(day, s), end: demoIso(day, e) })),
      };
    }),
  };
}

const SUMMARY = demoSummary();

/** Pick time zones, flip between text and picture, and copy the real output. */
export function AvailabilityShareDemo() {
  const summary = SUMMARY;
  const [extra, setExtra] = useState<string[]>(["America/Los_Angeles"]);
  const [view, setView] = useState<"text" | "image">("text");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const zones = [DEMO_ZONE, ...extra];
  const text = buildText(summary, zones, BOOKING_URL, false);

  useEffect(() => {
    if (view === "image" && canvasRef.current) drawImage(canvasRef.current, summary, zones, BOOKING_URL);
    // zones is derived from extra on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, extra, summary]);

  function toggleZone(zone: string) {
    setCopied(false);
    setExtra((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone].slice(-MAX_EXTRA)
    );
  }

  async function copy() {
    try {
      if (view === "text") {
        await navigator.clipboard.writeText(text);
      } else {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (permissions, older browsers); the preview is still there to select.
    }
  }

  return (
    <div className="glass rounded-[1.75rem] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-medium">
            Eastern (you)
          </span>
          {EXTRA_ZONES.map((z) => {
            const active = extra.includes(z.zone);
            return (
              <button
                key={z.zone}
                type="button"
                aria-pressed={active}
                onClick={() => toggleZone(z.zone)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "bg-[hsl(var(--aurora-1))] text-white shadow-sm"
                    : "bg-foreground/[0.05] text-foreground/75 hover:bg-foreground/[0.09]"
                }`}
              >
                {active ? "✓ " : "+ "}
                {z.label}
              </button>
            );
          })}
        </div>
        <div className="flex rounded-lg bg-foreground/[0.05] p-0.5" role="tablist" aria-label="Format">
          {(
            [
              ["text", "Text", Type],
              ["image", "Picture", ImageIcon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => {
                setView(key);
                setCopied(false);
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl bg-white/75 ring-1 ring-foreground/[0.06] overflow-hidden">
        {view === "text" ? (
          <pre className="max-h-[340px] overflow-auto whitespace-pre-wrap px-4 py-3.5 font-mono text-[12px] leading-relaxed text-foreground/85">
            {text}
          </pre>
        ) : (
          <canvas ref={canvasRef} className="block h-auto w-full" aria-label="Weekly availability picture" />
        )}
        <button
          type="button"
          onClick={copy}
          className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-md transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : view === "text" ? "Copy text" : "Copy picture"}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        This is the real output, built by the same code as the dashboard, from a sample week. Paste it anywhere.
      </p>
    </div>
  );
}
