"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check, Copy, Download, ImageIcon, Plus, RefreshCw, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ClockLoader } from "@/components/ui/clock-loader";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch, errorMessage } from "@/lib/api";
import {
  AvailabilitySummary,
  IMAGE_THEMES,
  type AvailabilityImageTheme,
  COMMON_ZONES,
  buildText,
  drawImage,
  isValidZone,
  zoneAbbr,
} from "@/lib/availability-share";

const RANGES = [1, 3, 5, 7, 14];
const ZONES_KEY = "timeiq-share-zones";

function loadSavedZones(): string[] | null {
  try {
    const raw = localStorage.getItem(ZONES_KEY);
    const zones = raw ? (JSON.parse(raw) as string[]) : null;
    return zones && zones.length && zones.every(isValidZone) ? zones : null;
  } catch {
    return null;
  }
}

function saveZones(zones: string[]) {
  try {
    localStorage.setItem(ZONES_KEY, JSON.stringify(zones));
  } catch {
    // Remembering the zones is only a convenience.
  }
}

/** "Share availability": your open times as paste-ready text or an image. */
export function ShareAvailability() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<number | "custom">(7);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const customDays = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
  const validRange = range !== "custom" || (Boolean(startDate && endDate) && Number.isInteger(customDays) && customDays >= 1 && customDays <= 31);
  const query = range === "custom" ? `start_date=${startDate}&end_date=${endDate}` : `days=${range}`;
  const [loadedSummary, setSummary] = useState<{ query: string; data: AvailabilitySummary } | null>(null);
  const summary = validRange && loadedSummary?.query === query ? loadedSummary.data : null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [imageTheme, setImageTheme] = useState<AvailabilityImageTheme>("classic");
  const [customZone, setCustomZone] = useState("");
  const [copied, setCopied] = useState<"text" | "image" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !validRange) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const s = await apiFetch<AvailabilitySummary>(`/api/availability/summary?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        setSummary({ query, data: s });
        setLoadError(null);
        // Your own zone first; anything you added last time comes back too.
        setZones((current) => {
          if (current.length) return current;
          const saved = loadSavedZones();
          return saved && saved[0] === s.timezone ? saved : [s.timezone];
        });
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, query, validRange, attempt, getToken]);

  const bookingUrl = summary ? `${typeof window !== "undefined" ? window.location.origin : "https://timeiq.app"}/book/${summary.username}` : "";
  const text = useMemo(
    () => (summary && zones.length ? buildText(summary, zones, bookingUrl, includeEmpty) : ""),
    [summary, zones, bookingUrl, includeEmpty]
  );

  useEffect(() => {
    if (summary && zones.length && canvasRef.current) drawImage(canvasRef.current, summary, zones, bookingUrl, imageTheme);
  }, [summary, zones, bookingUrl, imageTheme]);

  function updateZones(next: string[]) {
    setZones(next);
    saveZones(next);
  }

  function addZone(zone: string) {
    if (!zone || zones.includes(zone)) return;
    if (!isValidZone(zone)) {
      toast({ title: "Unknown time zone", description: "Use a name like Europe/Paris or America/Chicago.", variant: "destructive" });
      return;
    }
    updateZones([...zones, zone]);
    setCustomZone("");
  }

  function flash(kind: "text" | "image") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyText() {
    await navigator.clipboard.writeText(text);
    flash("text");
  }

  function pngBlob(): Promise<Blob> {
    return new Promise((resolve, reject) =>
      canvasRef.current?.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not draw the image"))), "image/png")
    );
  }

  async function copyImage() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob() })]);
      flash("image");
    } catch {
      toast({ title: "Couldn't copy the image", description: "Your browser blocked it. Use Download instead." });
    }
  }

  async function downloadImage() {
    const url = URL.createObjectURL(await pngBlob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "availability.png";
    a.click();
    URL.revokeObjectURL(url);
  }

  const addable = COMMON_ZONES.filter((z) => !zones.includes(z.zone));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Share2 className="mr-2 h-4 w-4" />
          Share availability
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share your availability</DialogTitle>
          <DialogDescription>
            Your open times from every connected calendar, inside your working hours. Copy it as text or as an image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Next</span>
            {RANGES.map((n) => (
              <Button key={n} size="sm" aria-pressed={range === n} variant={range === n ? "default" : "outline"} onClick={() => { setRange(n); setLoadError(null); }}>
                {n} {n === 1 ? "day" : "days"}
              </Button>
            ))}
            <Button size="sm" aria-pressed={range === "custom"} variant={range === "custom" ? "default" : "outline"} onClick={() => {
              if (!startDate && summary?.days.length) {
                setStartDate(summary.days[0].date);
                setEndDate(summary.days[summary.days.length - 1].date);
              }
              setRange("custom"); setLoadError(null);
            }}>
              Custom
            </Button>
            {range === "custom" && (
              <div className="flex w-full flex-wrap items-end gap-3">
                <label className="space-y-1 text-sm">
                  <span className="block">Start date</span>
                  <input type="date" value={startDate} aria-invalid={!validRange} className="h-9 rounded-md border bg-background px-2 text-sm" onChange={(e) => { setStartDate(e.target.value); setLoadError(null); }} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="block">End date</span>
                  <input type="date" value={endDate} min={startDate || undefined} aria-invalid={!validRange} className="h-9 rounded-md border bg-background px-2 text-sm" onChange={(e) => { setEndDate(e.target.value); setLoadError(null); }} />
                </label>
                <p className="text-xs text-muted-foreground">Up to 31 days, including both dates, within the next 90 days.</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Time zones</p>
            <div className="flex flex-wrap items-center gap-2">
              {zones.map((z, i) => (
                <span key={z} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
                  <span className="font-medium">{zoneAbbr(z)}</span>
                  <span className="text-muted-foreground">{z.replace(/_/g, " ")}</span>
                  {i === 0 ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">main</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${z}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => updateZones(zones.filter((x) => x !== z))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value=""
                onChange={(e) => addZone(e.target.value)}
                aria-label="Add a time zone"
              >
                <option value="">Add a time zone…</option>
                {addable.map((z) => (
                  <option key={z.zone} value={z.zone}>
                    {z.label} ({zoneAbbr(z.zone)})
                  </option>
                ))}
              </select>
              <input
                className="h-9 w-48 rounded-md border bg-background px-2 text-sm"
                placeholder="Other, e.g. Europe/Paris"
                value={customZone}
                onChange={(e) => setCustomZone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addZone(customZone.trim())}
              />
              <Button size="sm" variant="outline" onClick={() => addZone(customZone.trim())} disabled={!customZone.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!validRange ? (
            <p role="alert" className="text-sm text-destructive">Choose a start and end date spanning 1 to 31 days, including both dates.</p>
          ) : loadError ? (
            <div className="rounded-lg border p-4 text-sm" role="alert">
              <p className="mb-3">{loadError}</p>
              <Button size="sm" variant="outline" onClick={() => { setLoadError(null); setAttempt((n) => n + 1); }}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          ) : !summary ? (
            <div className="flex justify-center py-10">
              <ClockLoader label="Checking your calendars" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">As text</p>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={includeEmpty} onCheckedChange={setIncludeEmpty} />
                    Show days with no openings
                  </label>
                </div>
                <textarea
                  readOnly
                  value={text}
                  rows={Math.min(14, text.split("\n").length + 1)}
                  className="w-full rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
                />
                <Button size="sm" onClick={copyText}>
                  {copied === "text" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied === "text" ? "Copied" : "Copy text"}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">As an image</p>
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="mb-2 text-sm text-muted-foreground">Image theme</legend>
                  {(Object.keys(IMAGE_THEMES) as AvailabilityImageTheme[]).map((key) => (
                    <Button key={key} size="sm" variant={imageTheme === key ? "default" : "outline"} aria-pressed={imageTheme === key} onClick={() => setImageTheme(key)}>
                      <span aria-hidden="true" className="h-3 w-3 rounded-full border" style={{ backgroundColor: IMAGE_THEMES[key].openingBorder }} />
                      {IMAGE_THEMES[key].label}
                    </Button>
                  ))}
                </fieldset>
                <canvas ref={canvasRef} aria-label={`Availability image, ${IMAGE_THEMES[imageTheme].label} theme`} className="w-full rounded-md border" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={copyImage}>
                    {copied === "image" ? <Check className="mr-2 h-4 w-4" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                    {copied === "image" ? "Copied" : "Copy image"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadImage}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
