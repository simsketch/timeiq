import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
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
