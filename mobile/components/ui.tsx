import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  busy,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const t = useTheme();
  const bg = kind === "primary" ? t.primary : t.card;
  const fg = kind === "primary" ? t.primaryText : kind === "danger" ? t.danger : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: kind === "primary" ? bg : t.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.muted }]}>{children}</Text>;
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "error" }) {
  const t = useTheme();
  const colors = tone === "warn" ? { bg: t.warnBg, fg: t.warnText } : tone === "error" ? { bg: t.warnBg, fg: t.danger } : { bg: t.card, fg: t.muted };
  return (
    <View style={[styles.notice, { backgroundColor: colors.bg, borderColor: t.border }]}>
      <Text style={{ color: colors.fg, fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  button: { minHeight: 50, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, paddingHorizontal: 16 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
});

/** A tappable settings-style row with an icon, title, optional detail and a chevron. */
export function Row({ icon, title, detail, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [rowStyles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={22} color={t.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }}>{title}</Text>
        {detail ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.muted} />
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingVertical: 6 },
});

/** A themed single- or multi-line text input. */
export function Input(props: React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[inputStyles.input, props.multiline && { minHeight: 88, textAlignVertical: "top" }, { color: t.text, borderColor: t.border, backgroundColor: t.card }, props.style]}
    />
  );
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={[inputStyles.segments, { backgroundColor: t.border }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[inputStyles.segment, on && { backgroundColor: t.card }]}
          >
            <Text style={{ color: on ? t.text : t.muted, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping pill choices, for picking one value from a short list. */
export function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={inputStyles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[inputStyles.chip, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.card }]}
          >
            <Text style={{ color: on ? t.primaryText : t.text, fontWeight: "600" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A label and explanation beside an on/off switch. */
export function ToggleRow({ title, detail, value, onChange, disabled }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={[rowStyles.row, { opacity: disabled ? 0.5 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }}>{title}</Text>
        {detail ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.primary }} accessibilityLabel={title} />
    </View>
  );
}

const inputStyles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  segments: { flexDirection: "row", borderRadius: 11, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
