import { Ionicons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui";
import { useApi } from "@/lib/api";
import { getPref, setPref } from "@/lib/prefs";
import { useTheme } from "@/lib/theme";

type Step = { key: string; title: string; desc: string; href: Href; done: boolean };

/** Three steps to a first booking, for new accounts. Hides once they're all
 * done or when dismissed, like the website's card. */
export function SetupChecklist() {
  const t = useTheme();
  const api = useApi();
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [gone, eventTypes, calendars, bookings] = await Promise.all([
            getPref("onboarding.dismissed"),
            api<unknown[]>("/api/event-types"),
            api<unknown[]>("/api/calendars"),
            api<unknown[]>("/api/bookings"),
          ]);
          setDismissed(gone === "1");
          setSteps([
            { key: "event-type", title: "Create an event type", desc: "A 30-minute intro call is a good first one. Your booking link goes live with it.", href: "/event-types", done: eventTypes.length > 0 },
            { key: "calendar", title: "Connect your calendar", desc: "Google, Outlook or a calendar link, so bookings only land in free time.", href: "/calendars", done: calendars.length > 0 },
            { key: "booking", title: "Get your first booking", desc: "Share your booking link, or add a meeting yourself with +.", href: "/account", done: bookings.length > 0 },
          ]);
        } catch {
          setSteps(null);
        }
      })();
    }, [api])
  );

  if (!steps || dismissed) return null;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: t.muted }]}>Getting set up · {done} of {steps.length}</Text>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>Three steps to your first booking</Text>
        </View>
        <Pressable
          accessibilityLabel="Dismiss setup checklist"
          hitSlop={10}
          onPress={() => {
            setPref("onboarding.dismissed", "1");
            setDismissed(true);
          }}
        >
          <Ionicons name="close" size={20} color={t.muted} />
        </Pressable>
      </View>
      <View style={[styles.track, { backgroundColor: t.border }]}>
        <View style={[styles.fill, { backgroundColor: t.primary, width: `${(done / steps.length) * 100}%` }]} />
      </View>
      {steps.map((s) => (
        <Pressable key={s.key} disabled={s.done} onPress={() => router.push(s.href)} style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={s.done ? "#10b981" : t.muted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: s.done ? t.muted : t.text, fontSize: 15, fontWeight: "600", textDecorationLine: s.done ? "line-through" : "none" }}>{s.title}</Text>
            {!s.done && <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{s.desc}</Text>}
          </View>
          {!s.done && <Ionicons name="chevron-forward" size={18} color={t.muted} />}
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
});
