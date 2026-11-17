import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button, Card, Label, ToggleRow } from "@/components/ui";
import { type Me, useApi } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { useTheme } from "@/lib/theme";
import { rememberMe } from "@/lib/use-me";

// Same limits as the web card; the API accepts only a PNG data URL under 128 KB decoded.
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DATA_URL = 175_000;

/** Fit within 512 × 192, encode as PNG and halve until the data URL fits, like web. */
async function toLogoDataUrl(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  const { width, height } = original;
  let scale = Math.min(1, 512 / width, 192 / height);
  for (;;) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const image = await context.reset().resize({ width: w, height: h }).renderAsync();
    const { base64 } = await image.saveAsync({ format: SaveFormat.PNG, base64: true });
    const data = `data:image/png;base64,${base64 ?? ""}`;
    if (base64 && (data.length <= MAX_DATA_URL || (w === 1 && h === 1))) return data;
    scale /= 2;
  }
}

// Declared here because lib/api.ts is shared; the API returns both fields on /api/me.
type BrandedMe = Me & { booking_logo?: string | null; booking_white_label?: boolean };

/** Booking page logo and "Hide TimeIQ branding", saved to /api/me like the web card. */
export function BookingBrandingCard({ me }: { me: BrandedMe }) {
  const t = useTheme();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const logo = me.booking_logo ?? null;
  const whiteLabel = me.booking_white_label ?? false;

  async function save(body: { booking_logo?: string | null; booking_white_label: boolean }) {
    const next = await api<BrandedMe>("/api/me", { method: "PATCH", body: JSON.stringify(body) });
    rememberMe({ ...me, ...next });
  }

  async function update(body: { booking_logo?: string | null; booking_white_label: boolean }, failTitle = "Couldn't save branding") {
    if (busy) return;
    setBusy(true);
    try {
      await save(body);
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      if (!asset.mimeType || !TYPES.includes(asset.mimeType) || (asset.fileSize ?? 0) > MAX_BYTES) {
        throw new Error("Choose a PNG, JPEG or WebP image under 5 MB.");
      }
      await save({ booking_logo: await toLogoDataUrl(asset.uri), booking_white_label: true });
    } catch (e) {
      Alert.alert("Couldn't upload the logo", e instanceof Error ? e.message : "Try another image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12, marginTop: 8 }}>
      <Label>Your branding</Label>
      <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
        Upload your logo to replace TimeIQ branding on your booking page and meeting pages. Transparent PNGs work best. You can turn TimeIQ branding back on below.
      </Text>
      {logo && (
        <View style={{ backgroundColor: "#ffffff", borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 16, alignItems: "center" }}>
          <Image source={{ uri: logo }} style={{ width: 240, height: 80 }} contentFit="contain" accessibilityLabel="Your booking logo" />
        </View>
      )}
      <Button title={logo ? "Replace logo" : "Upload your logo"} kind="secondary" busy={busy} onPress={pick} />
      {logo && <Button title="Remove logo" kind="secondary" disabled={busy} onPress={() => update({ booking_logo: null, booking_white_label: whiteLabel })} />}
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>PNG, JPEG or WebP, up to 5 MB. Resized automatically.</Text>
      <ToggleRow
        title="Hide TimeIQ branding"
        detail="Remove the TimeIQ logo and “Powered by” footer from public booking pages."
        value={whiteLabel}
        disabled={busy}
        onChange={(v) => update({ booking_white_label: v })}
      />
      <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/book/${me.username}`)}>
        <Text style={{ color: t.primary, fontWeight: "600" }}>Preview booking page</Text>
      </Pressable>
    </Card>
  );
}
