import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Input } from "@/components/ui";
import { useTheme } from "@/lib/theme";

const COMMON_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
  "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "America/Mexico_City", "America/Sao_Paulo", "America/Bogota",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "Europe/Amsterdam", "Europe/Stockholm", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow", "Africa/Cairo",
  "Africa/Johannesburg", "Africa/Lagos", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Seoul", "Asia/Tokyo", "Australia/Perth", "Australia/Sydney",
  "Pacific/Auckland", "UTC",
];

export function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list.includes("UTC") ? list : [...list, "UTC"];
  } catch {
    // Older engines lack supportedValuesOf; the common list covers most people.
  }
  return COMMON_ZONES;
}

/** "America/New_York" to "New York (GMT-5)". */
export function zoneLabel(zone: string): string {
  const city = zone.split("/").pop()!.replace(/_/g, " ");
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${city} (${offset})` : city;
  } catch {
    return city;
  }
}

/** A searchable sheet of IANA time zones. `home` (the account's zone) is listed first and marked. */
export function ZonePicker({
  visible,
  current,
  home,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: string;
  home?: string;
  onClose: () => void;
  onPick: (zone: string) => void;
}) {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const zones = useMemo(allZones, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "_");
    const list = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
    return home && !q ? [home, ...list.filter((z) => z !== home)] : list;
  }, [query, zones, home]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
        <View style={styles.sheetHead}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Time zone</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: t.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Input value={query} onChangeText={setQuery} placeholder="Search, e.g. London" autoCorrect={false} clearButtonMode="while-editing" />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(z) => z}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} style={({ pressed }) => [styles.zone, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>
                {item.replace(/_/g, " ")}
                {item === home ? <Text style={{ color: t.muted }}>  · yours</Text> : null}
              </Text>
              {item === current && <Ionicons name="checkmark" size={20} color={t.primary} />}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetHead: { flexDirection: "row", alignItems: "center", padding: 16 },
  zone: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
