"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";

type Branding = { booking_logo: string | null; booking_white_label: boolean };

export function BookingBrandingCard({ username, initialLogo, initialWhiteLabel }: {
  username: string; initialLogo?: string | null; initialWhiteLabel?: boolean;
}) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const t = useTranslations("eventTypes.branding");
  const tc = useTranslations("common");
  const [logo, setLogo] = useState(initialLogo ?? null);
  const [whiteLabel, setWhiteLabel] = useState(initialWhiteLabel ?? false);
  const [busy, setBusy] = useState(false);

  async function save(nextLogo: string | null, nextWhiteLabel: boolean) {
    const token = await getToken();
    const result = await apiFetch<Branding>("/api/me", {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ booking_logo: nextLogo, booking_white_label: nextWhiteLabel }),
    });
    setLogo(result.booking_logo);
    setWhiteLabel(result.booking_white_label);
    toast({ title: t("saved") });
  }

  async function update(nextLogo: string | null, nextWhiteLabel: boolean) {
    if (busy) return;
    setBusy(true);
    try { await save(nextLogo, nextWhiteLabel); }
    catch (error) { toast({ title: t("saveFailed"), description: error instanceof Error ? error.message : tc("retry"), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        throw new Error(t("badFile"));
      }
      const bitmap = await createImageBitmap(file);
      let data: string;
      try {
        const canvas = document.createElement("canvas");
        let scale = Math.min(1, 512 / bitmap.width, 192 / bitmap.height);
        do {
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          data = canvas.toDataURL("image/png");
          scale /= 2;
        } while (data.length > 175_000);
      } finally { bitmap.close(); }
      await save(data, true);
    } catch (error) {
      toast({ title: t("uploadFailed"), description: error instanceof Error ? error.message : t("tryAnother"), variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Card id="branding" className="scroll-mt-6">
      <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{t("body")}</p>
        {logo && (
          <div className="flex items-center gap-4 rounded-lg border bg-white p-4">
            {/* Uploaded logos are bounded, validated PNG data URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={t("logoAlt")} className="max-h-20 max-w-60 object-contain" />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => update(null, whiteLabel)}>{t("removeLogo")}</Button>
          </div>
        )}
        <label className="block space-y-2 text-sm font-medium">
          {t("upload")}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
          <span className="block text-xs font-normal text-muted-foreground">{t("uploadHelp")}</span>
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span><span className="block font-medium">{t("hide")}</span><span className="text-muted-foreground">{t("hideHelp")}</span></span>
          <Switch checked={whiteLabel} disabled={busy} onCheckedChange={(checked) => update(logo, checked)} />
        </label>
        <div className="flex items-center gap-3 text-sm">
          <a href={`/book/${username}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("preview")}</a>
          {busy && <span role="status" className="text-muted-foreground">{tc("saving")}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
