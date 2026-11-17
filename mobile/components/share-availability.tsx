import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateField } from "@/components/date-time-field";
import { Button, Card, Chips, Label, Notice, ToggleRow } from "@/components/ui";
import { ZonePicker } from "@/components/zone-picker";
import { useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { getPref, setPref } from "@/lib/prefs";
import { useTheme } from "@/lib/theme";

// Ported from frontend/src/lib/availability-share.ts (text half only; the image is drawn on a web canvas).
interface FreeDay {
  date: string;
  windows: { start: string; end: string }[];
}
export interface AvailabilitySummary {
  timezone: string;
  username: string;
  days: FreeDay[];
}

const RANGES = [1, 3, 5, 7, 14];
const ZONES_KEY = "share-zones";

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "EST", "PDT", "GMT+1". */
function zoneAbbr(zone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName");
  return part?.value ?? zone;
}

/** "9–11 AM", "11 AM–1:30 PM". Built by hand because Hermes lacks formatRange. */
function timeRange(start: Date, end: Date, zone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
  const one = (d: Date) => fmt.format(d).replace(/[  ]/g, " ").replace(/:00(?=\s|$)/, "");
  const [a, b] = [one(start), one(end)];
  const [aSuffix, bSuffix] = [a.slice(-2), b.slice(-2)];
  return aSuffix === bSuffix && /[AP]M/.test(aSuffix) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

function dayKey(d: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Windows grouped by calendar day in the primary zone. */
function groupByDay(summary: AvailabilitySummary, primary: string) {
  const groups = new Map<string, { key: string; label: string; windows: { start: Date; end: Date }[] }>();
  if (primary === summary.timezone) for (const d of summary.days) groups.set(d.date, { key: d.date, label: dayLabel(d.date), windows: [] });
  for (const d of summary.days) {
    for (const w of d.windows) {
      const start = new Date(w.start);
      const key = dayKey(start, primary);
      if (!groups.has(key)) groups.set(key, { key, label: dayLabel(key), windows: [] });
      groups.get(key)!.windows.push({ start, end: new Date(w.end) });
    }
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildText(summary: AvailabilitySummary, zones: string[], bookingUrl: string, includeEmptyDays: boolean): string {
  const [primary, ...others] = zones;
  const groups = groupByDay(summary, primary).filter((g) => includeEmptyDays || g.windows.length);
  // Name zones as of the first opening, so a week after a clock change says EST, not EDT.
  const ref = groups.find((g) => g.windows.length)?.windows[0].start ?? new Date();
  const lines: string[] = [];
  if (!groups.length) {
    lines.push("I'm fully booked for this stretch. Here's my booking link for later dates:");
  } else {
    lines.push(`Here's when I'm free (times in ${zones.map((z) => zoneAbbr(z, ref)).join(" / ")}):`, "");
    for (const g of groups) {
      if (!g.windows.length) {
        lines.push(`${g.label}: no openings`);
        continue;
      }
      lines.push(g.label);
      for (const w of g.windows) {
        const parts = [primary, ...others].map((z) => `${timeRange(w.start, w.end, z)} ${zoneAbbr(z, w.start)}`);
        lines.push(`  ${parts.join("  ·  ")}`);
      }
    }
    lines.push("", "Or grab a time directly:");
  }
  lines.push(bookingUrl);
  return lines.join("\n");
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Share availability": a button that opens a sheet with your open times as paste-ready text. */
export function ShareAvailability() {
  const t = useTheme();
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<number | "custom">(7);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const customDays = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
  const validRange = range !== "custom" || (Boolean(startDate && endDate) && Number.isInteger(customDays) && customDays >= 1 && customDays <= 31);
  const query = range === "custom" ? `start_date=${startDate}&end_date=${endDate}` : `days=${range}`;
  const [loaded, setLoaded] = useState<{ query: string; data: AvailabilitySummary } | null>(null);
  const summary = validRange && loaded?.query === query ? loaded.data : null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [zones, setZones] = useState<string[]>([]);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !validRange) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await api<AvailabilitySummary>(`/api/availability/summary?${query}`);
        if (cancelled) return;
        setLoaded({ query, data: s });
        setLoadError(null);
        // Your own zone first; anything you added last time comes back too.
        const raw = await getPref(ZONES_KEY);
        let saved: string[] | null = null;
        try {
          saved = raw ? (JSON.parse(raw) as string[]) : null;
        } catch {
          // A corrupt pref just means starting from your own zone.
        }
        if (cancelled) return;
        setZones((current) => {
          if (current.length) return current;
          return saved?.length && saved[0] === s.timezone && saved.every(isValidZone) ? saved : [s.timezone];
        });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load your availability.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, query, validRange, attempt, api]);

  const text = useMemo(
    () => (summary && zones.length ? buildText(summary, zones, `${SITE_URL}/book/${summary.username}`, includeEmpty) : ""),
    [summary, zones, includeEmpty]
  );

  function updateZones(next: string[]) {
    setZones(next);
    setPref(ZONES_KEY, JSON.stringify(next));
  }

  function chooseRange(v: number | "custom") {
    if (v === "custom" && !startDate) {
      const days = summary?.days;
      const today = new Date();
      setStartDate(days?.length ? days[0].date : isoDay(today));
      setEndDate(days?.length ? days[days.length - 1].date : isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6)));
    }
    setRange(v);
    setLoadError(null);
  }

  async function copyText() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button title="Share availability" kind="secondary" icon={<Ionicons name="share-outline" size={18} color={t.text} />} onPress={() => setOpen(true)} />
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
          <View style={styles.head}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Share your availability</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: t.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
              Your open times from every connected calendar, inside your working hours, ready to paste.
            </Text>

            <View>
              <Label>Next</Label>
              <Chips
                options={[...RANGES.map((n) => ({ value: n as number | "custom", label: `${n} ${n === 1 ? "day" : "days"}` })), { value: "custom", label: "Custom" }]}
                value={range}
                onChange={chooseRange}
              />
            </View>

            {range === "custom" && (
              <Card style={{ gap: 10 }}>
                <View style={styles.dateRow}>
                  <Text style={{ color: t.text, fontSize: 16 }}>Start</Text>
                  <DateField value={startDate} onChange={(v) => { setStartDate(v); setLoadError(null); }} />
                </View>
                <View style={styles.dateRow}>
                  <Text style={{ color: t.text, fontSize: 16 }}>End</Text>
                  <DateField value={endDate} minimum={startDate} onChange={(v) => { setEndDate(v); setLoadError(null); }} />
                </View>
                <Text style={{ color: validRange ? t.muted : t.danger, fontSize: 13 }}>Up to 31 days, including both dates, within the next 90 days.</Text>
              </Card>
            )}

            <View>
              <Label>Time zones</Label>
              <Card style={{ paddingVertical: 4 }}>
                {zones.map((z, i) => (
                  <View key={z} style={[styles.zone, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: "600", minWidth: 48 }}>{zoneAbbr(z)}</Text>
                    <Text style={{ color: t.muted, fontSize: 15, flex: 1 }} numberOfLines={1}>{z.replace(/_/g, " ")}</Text>
                    {i === 0 ? (
                      <Text style={{ color: t.muted, fontSize: 11, letterSpacing: 0.4 }}>MAIN</Text>
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${z}`} hitSlop={10} onPress={() => updateZones(zones.filter((x) => x !== z))}>
                        <Ionicons name="close-circle" size={22} color={t.muted} />
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable accessibilityRole="button" onPress={() => setPicking(true)} disabled={!zones.length} style={[styles.zone, zones.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
                  <Ionicons name="add-circle-outline" size={22} color={t.primary} />
                  <Text style={{ color: t.primary, fontSize: 16, fontWeight: "600" }}>Add a time zone</Text>
                </Pressable>
              </Card>
            </View>

            {!validRange ? (
              <Notice tone="error">Choose a start and end date spanning 1 to 31 days, including both dates.</Notice>
            ) : loadError ? (
              <View style={{ gap: 10 }}>
                <Notice tone="error">{loadError}</Notice>
                <Button title="Try again" kind="secondary" onPress={() => { setLoadError(null); setAttempt((n) => n + 1); }} />
              </View>
            ) : !summary ? (
              <ActivityIndicator style={{ marginVertical: 32 }} />
            ) : (
              <>
                <Card style={{ paddingVertical: 4 }}>
                  <ToggleRow title="Show days with no openings" value={includeEmpty} onChange={setIncludeEmpty} />
                </Card>
                <Card>
                  <Text selectable style={{ color: t.text, fontSize: 13, lineHeight: 20, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) }}>
                    {text}
                  </Text>
                </Card>
                <View style={styles.actions}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={copied ? "Copied" : "Copy text"}
                      kind="secondary"
                      icon={<Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={t.text} />}
                      onPress={copyText}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Share" icon={<Ionicons name="share-outline" size={18} color={t.primaryText} />} onPress={() => Share.share({ message: text })} />
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
        <ZonePicker
          visible={picking}
          current=""
          home={zones[0]}
          onClose={() => setPicking(false)}
          onPick={(z) => {
            if (!zones.includes(z)) updateZones([...zones, z]);
            setPicking(false);
          }}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", padding: 16 },
  body: { padding: 16, gap: 16, paddingBottom: 48 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  zone: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50 },
  actions: { flexDirection: "row", gap: 10 },
});
