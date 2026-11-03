import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { fmt } from "@/lib/time";

/** A date-and-time picker shown in the account's zone. iOS shows it inline;
 * Android opens the system date dialog, then the time dialog. */
export function DateTimeField({ value, onChange, zone }: { value: Date; onChange: (d: Date) => void; zone: string }) {
  const t = useTheme();
  const [androidStep, setAndroidStep] = useState<"date" | "time" | null>(null);
  // The picker works in the phone's zone; shift so its wall clock matches `zone`.
  const offset = zoneOffsetMs(value, zone) - zoneOffsetMs(value, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const shown = new Date(value.getTime() + offset);
  const back = (d: Date) => onChange(new Date(d.getTime() - offset));

  if (Platform.OS === "ios") {
    return (
      <View style={styles.ios}>
        <DateTimePicker value={shown} mode="datetime" minuteInterval={5} onChange={(_, d) => d && back(d)} accentColor={t.primary} />
      </View>
    );
  }
  return (
    <>
      <Pressable onPress={() => setAndroidStep("date")} style={[styles.android, { borderColor: t.border, backgroundColor: t.card }]}>
        <Text style={{ color: t.text, fontSize: 16 }}>
          {fmt(value, zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </Text>
      </Pressable>
      {androidStep && (
        <DateTimePicker
          value={shown}
          mode={androidStep}
          minuteInterval={5}
          onChange={(e, d) => {
            if (e.type !== "set" || !d) return setAndroidStep(null);
            back(d);
            setAndroidStep(androidStep === "date" ? "time" : null);
          }}
        />
      )}
    </>
  );
}

function zoneOffsetMs(at: Date, zone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at.getTime() / 1000) * 1000;
}

const styles = StyleSheet.create({
  ios: { alignItems: "flex-start" },
  android: { borderWidth: 1, borderRadius: 12, padding: 14 },
});

/** A calendar-date picker over "YYYY-MM-DD" strings (no time or zone involved). */
export function DateField({ value, onChange, minimum }: { value: string; onChange: (v: string) => void; minimum?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [y, m, d] = value.split("-").map(Number);
  const asDate = new Date(y, m - 1, d, 12);
  const min = minimum ? new Date(`${minimum}T12:00:00`) : undefined;
  const pick = (picked: Date) =>
    onChange(`${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, "0")}-${String(picked.getDate()).padStart(2, "0")}`);

  if (Platform.OS === "ios") {
    return (
      <View style={styles.ios}>
        <DateTimePicker value={asDate} mode="date" minimumDate={min} onChange={(_, picked) => picked && pick(picked)} accentColor={t.primary} />
      </View>
    );
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.android, { borderColor: t.border, backgroundColor: t.card }]}>
        <Text style={{ color: t.text, fontSize: 16 }}>{asDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={asDate}
          mode="date"
          minimumDate={min}
          onChange={(e, picked) => {
            setOpen(false);
            if (e.type === "set" && picked) pick(picked);
          }}
        />
      )}
    </>
  );
}
