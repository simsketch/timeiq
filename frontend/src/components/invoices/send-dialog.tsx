"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { splitEmails } from "@/components/clients/email-chips";

const COPY_KEY = "timeiq:send-copy-to-me";

/**
 * Confirms a send or reminder and lets the user choose which of the client's
 * billing addresses receive it. Every address starts checked.
 */
export function SendDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  billingEmails,
  senderEmail,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  billingEmails: string | null;
  /** Shown beside "Send me a copy"; the copy is a BCC of the same email. */
  senderEmail?: string;
  busy: boolean;
  onConfirm: (recipients: string[], copyMe: boolean) => void;
}) {
  const all = splitEmails(billingEmails);
  const [chosen, setChosen] = useState<string[]>(all);
  const [copyMe, setCopyMe] = useState(true);

  // Remember the copy preference per browser; storage can be unavailable.
  useEffect(() => {
    try {
      if (localStorage.getItem(COPY_KEY) === "0") setCopyMe(false);
    } catch {}
  }, []);

  function setCopy(next: boolean) {
    setCopyMe(next);
    try {
      localStorage.setItem(COPY_KEY, next ? "1" : "0");
    } catch {}
  }

  // Reset to everyone each time the dialog opens.
  useEffect(() => {
    if (open) setChosen(splitEmails(billingEmails));
  }, [open, billingEmails]);

  const toggle = (email: string) =>
    setChosen((c) => (c.includes(email) ? c.filter((e) => e !== email) : [...c, email]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1 py-2">
          <legend className="mb-2 text-sm font-medium">Send to</legend>
          {all.map((email) => (
            <label
              key={email}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
            >
              <input
                type="checkbox"
                checked={chosen.includes(email)}
                onChange={() => toggle(email)}
                className="h-4 w-4 accent-primary"
              />
              <span className="truncate">{email}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={copyMe}
            onChange={(e) => setCopy(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="min-w-0">
            Send me a copy
            {senderEmail && (
              <span className="block truncate text-xs text-muted-foreground">
                BCC to {senderEmail}
              </span>
            )}
          </span>
        </label>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(chosen, copyMe)} disabled={busy || chosen.length === 0}>
            {chosen.length > 1 ? `${confirmLabel} to ${chosen.length}` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
