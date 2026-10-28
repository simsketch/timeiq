"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

export function EmbedSnippets({ username, slug }: { username: string | null; slug?: string }) {
  const { toast } = useToast();
  const path = [username, slug].filter(Boolean).map((part) => encodeURIComponent(part!)).join("/");
  const url = `https://timeiq.app/book/${path}?embed=1`;
  const snippets = [
    ["Inline iframe", `<iframe src="${url}" title="Book a meeting" width="100%" height="720" style="border:0;background:transparent"></iframe>`],
    ["Auto-resizing widget", `<script src="https://timeiq.app/embed.js" data-timeiq="${path}"></script>`],
    ["Popup button", `<script src="https://timeiq.app/embed.js" data-timeiq="${path}" data-mode="popup" data-label="Book a meeting"></script>`],
  ];
  async function copy(snippet: string) {
    try {
      await navigator.clipboard.writeText(snippet);
      toast({ title: "Embed code copied" });
    } catch {
      toast({ title: "Select and copy the code", description: "Clipboard access is unavailable. Copy the code from the text box." });
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="outline" disabled={!username}>Add to your website</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to your website</DialogTitle>
          <DialogDescription>Paste a snippet into your website&apos;s HTML. The widget adjusts its height as guests book.</DialogDescription>
        </DialogHeader>
        {snippets.map(([label, snippet], index) => (
          <div key={label} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`embed-snippet-${index}`} className="text-sm font-medium">{label}</label>
              <Button size="sm" variant="outline" onClick={() => copy(snippet)}>Copy</Button>
            </div>
            <Textarea id={`embed-snippet-${index}`} readOnly value={snippet} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
