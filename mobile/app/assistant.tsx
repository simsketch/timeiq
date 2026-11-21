import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HINGE, readable, useFold, useWide } from "@/components/ui";
import { confirmAiConsent } from "@/lib/ai-consent";
import { useApi } from "@/lib/api";
import { SCREENSHOT_MODE } from "@/lib/config";
import { screenshotAssistant } from "@/lib/screenshot-fixtures";
import { useTheme, type Theme } from "@/lib/theme";
import { useMe } from "@/lib/use-me";

// Anthropic-format history, kept as the server returns it so tool results carry over between turns.
type Block = { type: string; text?: string; [k: string]: unknown };
type Message = { role: "user" | "assistant"; content: string | Block[] };
type Step = { tool: string; ok: boolean };
type Turn = { role: "user" | "assistant"; text: string; steps?: Step[] };

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

// Kept for the app session, so leaving the screen doesn't lose the conversation (the web keeps it per tab).
const kept: { history: Message[]; steps: Step[][] } = SCREENSHOT_MODE ? screenshotAssistant : { history: [], steps: [] };

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
function Reply({ text, t }: { text: string; t: Theme }) {
  const bold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <Text key={i} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text> : part,
    );
  return (
    <View style={{ gap: 10 }}>
      {text.split(/\n{2,}/).map((block, b) => (
        <View key={b} style={{ gap: 4 }}>
          {block.split("\n").map((line, i) => {
            const item = line.match(/^\s*[-•]\s+(.*)$/);
            return item ? (
              <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={[styles.reply, { color: t.primary }]}>•</Text>
                <Text style={[styles.reply, { color: t.text, flex: 1 }]}>{bold(item[1])}</Text>
              </View>
            ) : (
              <Text key={i} style={[styles.reply, { color: t.text }]}>{bold(line)}</Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function Assistant() {
  const t = useTheme();
  const api = useApi();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  // Unfolded Duo: the conversation on one side of the fold, the starters and the composer on the other
  // (left and right held like a book, top and bottom held like a laptop).
  const fold = useFold();
  const [history, setHistory] = useState<Message[]>(kept.history);
  const [steps, setSteps] = useState<Step[][]>(kept.steps);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInputInstance>(null);
  // Speak instead of type, like the website's mic: the running transcript is appended to what's already typed.
  const [listening, setListening] = useState(false);
  const spokenBase = useRef("");
  useSpeechRecognitionEvent("result", (e) => setDraft(spokenBase.current + (e.results[0]?.transcript ?? "")));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (e) => {
    setListening(false);
    if (e.error !== "aborted" && e.error !== "no-speech") setError("Couldn't hear that. Try again, or type it.");
  });
  async function toggleMic() {
    if (listening) return ExpoSpeechRecognitionModule.stop();
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return setError("Turn on microphone and speech recognition for TimeIQ in Settings to speak your question.");
    spokenBase.current = draft.trim() ? `${draft.trimEnd()} ` : "";
    setError(null);
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
  }
  const scroll = useRef<ScrollViewInstance>(null);

  // Only settled turns: a request still in flight when the screen closes is dropped, not resent.
  useEffect(() => {
    if (!busy) Object.assign(kept, { history, steps });
  }, [busy, history, steps]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    if (listening) ExpoSpeechRecognitionModule.stop();
    if (!(await confirmAiConsent())) return;
    const next: Message[] = [...history, { role: "user", content: message }];
    setHistory(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ messages: Message[]; steps: Step[] }>("/api/me/assistant", {
        method: "POST",
        body: JSON.stringify({ messages: next }),
      });
      setHistory(res.messages);
      setSteps([...steps, res.steps]);
    } catch (e) {
      setHistory(history);
      setDraft(message);
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setHistory([]);
    setSteps([]);
    setDraft("");
    setError(null);
  }

  const turns = turnsFrom(history, steps);
  const empty = turns.length === 0;
  const firstName = me?.name?.split(" ")[0];

  const suggestions = (
    <View style={[styles.chips, fold?.below ? styles.column : null]}>
      {SUGGESTIONS.map((s) => (
        <Pressable
          key={s}
          accessibilityRole="button"
          onPress={() => (s.startsWith("Add a schedule") ? (setDraft("Add this schedule to my calendar:\n"), input.current?.focus()) : send(s))}
          style={({ pressed }) => [styles.chip, { borderColor: t.border, backgroundColor: t.card, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: t.text, fontSize: 14 }}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior="padding"
      // shortcut: assumes the standard 44pt iOS stack header; use the real header height if this screen gets a large title.
      keyboardVerticalOffset={insets.top + 44}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      <Stack.Screen
        options={{
          title: "Ask TimeIQ",
          headerRight: () =>
            empty ? null : (
              <Pressable onPress={reset} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="New chat" style={{ opacity: busy ? 0.5 : 1 }}>
                <Ionicons name="refresh" size={22} color={t.primary} />
              </Pressable>
            ),
        }}
      />
      <View style={fold?.x ? styles.split : { flex: 1 }}>
      <ScrollView
        ref={scroll}
        style={fold?.x ? { width: fold.x, flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth, borderColor: t.border } : undefined}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {empty ? (
          <View style={{ gap: 6 }}>
            <Text style={[styles.title, { color: t.text }]}>What should we schedule{firstName ? `, ${firstName}` : ""}?</Text>
            <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>Ask about your week, find time with people, or paste a schedule.</Text>
            {!fold && suggestions}
          </View>
        ) : (
          turns.map((turn, i) =>
            turn.role === "user" ? (
              <View key={i} style={[styles.bubble, { backgroundColor: t.text }]}>
                <Text style={{ color: t.bg, fontSize: 16, lineHeight: 22 }}>{turn.text}</Text>
              </View>
            ) : (
              <View key={i} style={{ gap: 8 }}>
                {turn.steps && turn.steps.length > 0 && (
                  <View style={styles.chips}>
                    {[...new Set(turn.steps.map((s) => s.tool))].map((tool) => (
                      <View key={tool} style={[styles.step, { backgroundColor: t.card, borderColor: t.border }]}>
                        <Text style={{ color: t.muted, fontSize: 12 }}>{STEP_LABEL[tool] ?? tool.replaceAll("_", " ")}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Reply text={turn.text} t={t} />
              </View>
            ),
          )
        )}
        {/* Wide windows have the room to keep the starters on offer after the conversation. */}
        {!fold && wide && !empty && !busy && suggestions}
        {busy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={t.primary} />
            <Text style={{ color: t.muted, fontSize: 14 }}>Working on it…</Text>
          </View>
        )}
      </ScrollView>

      <View style={fold?.x ? { flex: 1, justifyContent: "flex-end" } : fold?.below ? { height: fold.below + HINGE / 2, paddingTop: HINGE, justifyContent: "space-between" } : undefined}>
      {fold && !busy && <View style={styles.starters}>{suggestions}</View>}
      <View style={[styles.composer, { borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 10) }, fold?.x ? { paddingLeft: HINGE / 2 } : null]}>
        {error && <Text accessibilityRole="alert" style={{ color: t.danger, fontSize: 14, marginBottom: 8 }}>{error}</Text>}
        <View style={[styles.box, { borderColor: t.border, backgroundColor: t.card }]}>
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Find 30 minutes with Sam next week…"
            placeholderTextColor={t.muted}
            accessibilityLabel="Message TimeIQ"
            style={[styles.input, { color: t.text }]}
          />
          <Pressable
            onPress={toggleMic}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={listening ? "Stop listening" : "Speak your question"}
            accessibilityState={{ selected: listening }}
            style={[styles.send, { backgroundColor: listening ? "#F2690D" : "transparent", opacity: busy ? 0.35 : 1 }]}
          >
            <Ionicons name={listening ? "stop" : "mic-outline"} size={20} color={listening ? "#ffffff" : t.muted} />
          </Pressable>
          <Pressable
            onPress={() => send(draft)}
            disabled={!draft.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.send, { backgroundColor: t.primary, opacity: !draft.trim() || busy ? 0.35 : 1 }]}
          >
            <Ionicons name="arrow-up" size={20} color={t.primaryText} />
          </Pressable>
        </View>
      </View>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 18, flexGrow: 1, ...readable, maxWidth: 760 },
  split: { flex: 1, flexDirection: "row" },
  starters: { paddingHorizontal: 16, paddingBottom: 12 },
  column: { flexDirection: "column", alignItems: "flex-start" },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  step: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  bubble: { alignSelf: "flex-end", maxWidth: "85%", borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  reply: { fontSize: 16, lineHeight: 23 },
  composer: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  box: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderWidth: 1, borderRadius: 22, paddingLeft: 14, paddingRight: 5, paddingVertical: 5, ...readable, maxWidth: 760 },
  input: { flex: 1, maxHeight: 140, minHeight: 36, fontSize: 16, paddingTop: 8, paddingBottom: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
