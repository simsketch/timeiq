"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

export function EmbedSnippets({ username, slug }: { username: string | null; slug?: string }) {
  const { toast } = useToast();
  const t = useTranslations("embed");
  const tc = useTranslations("common");
  const path = [username, slug].filter(Boolean).map((part) => encodeURIComponent(part!)).join("/");
  const url = `https://timeiq.app/book/${path}?embed=1`;
  const snippets = [
    [t("inline"), `<iframe src="${url}" title="${t("bookMeeting")}" width="100%" height="720" style="border:0;background:transparent"></iframe>`],
    [t("widget"), `<script src="https://timeiq.app/embed.js" data-timeiq="${path}"></script>`],
    [t("popup"), `<script src="https://timeiq.app/embed.js" data-timeiq="${path}" data-mode="popup" data-label="${t("bookMeeting")}"></script>`],
  ];
  async function copy(snippet: string) {
    try {
      await navigator.clipboard.writeText(snippet);
      toast({ title: t("copied") });
    } catch {
      toast({ title: t("copyFailed"), description: t("copyFailedBody") });
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="outline" disabled={!username}>{t("button")}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {snippets.map(([label, snippet], index) => (
          <div key={label} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`embed-snippet-${index}`} className="text-sm font-medium">{label}</label>
              <Button size="sm" variant="outline" onClick={() => copy(snippet)}>{tc("copy")}</Button>
            </div>
            <Textarea id={`embed-snippet-${index}`} readOnly value={snippet} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
