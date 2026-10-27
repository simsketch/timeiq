"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { Check, Copy, Mail, RotateCcw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch, errorMessage } from "@/lib/api";

interface EmailImport {
  id: string;
  sender: string | null;
  subject: string | null;
  status:
    | "processing"
    | "imported"
    | "empty"
    | "failed"
    | "rejected"
    | "undone"
    | "meeting"
    | "meeting_reply"
    | "meeting_booked"
    | "meeting_error"
    | "ignored";
  event_count: number;
  error: string | null;
  created_at: string;
}

interface Inbox {
  address: string;
  enabled: boolean;
  imports: EmailImport[];
}

const STATUS: Record<EmailImport["status"], string> = {
  processing: "Reading…",
  imported: "Added",
  empty: "No schedule found",
  failed: "Error",
  rejected: "Not added",
  undone: "Undone",
  meeting: "Started a group meeting",
  meeting_reply: "Meeting reply",
  meeting_booked: "Booked a meeting",
  meeting_error: "Error",
  ignored: "Ignored",
};

/** Calendars page card: the address to email schedules to, and recent imports. */
export function EmailSchedules({ onChange }: { onChange?: () => void }) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const call = useCallback(
    async <T,>(path: string, method = "GET"): Promise<T> => {
      const token = await getToken();
      return apiFetch<T>(path, { method, headers: { Authorization: `Bearer ${token}` } });
    },
    [getToken]
  );

  useEffect(() => {
    call<Inbox>("/api/email-imports")
      .then(setInbox)
      .catch(() => setInbox(null));
  }, [call]);

  async function copy() {
    if (!inbox) return;
    await navigator.clipboard.writeText(inbox.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function newAddress() {
    try {
      setInbox(await call<Inbox>("/api/email-imports/address", "POST"));
      setConfirmNew(false);
      toast({ title: "New address ready", description: "The old address no longer works." });
    } catch (e) {
      toast({ title: "Couldn't change the address", description: errorMessage(e), variant: "destructive" });
    }
  }

  async function undo(item: EmailImport) {
    try {
      const r = await call<{ removed: number }>(`/api/email-imports/${item.id}/undo`, "POST");
      setInbox(await call<Inbox>("/api/email-imports"));
      toast({ title: `Removed ${r.removed} event${r.removed === 1 ? "" : "s"}` });
      onChange?.();
    } catch (e) {
      toast({ title: "Couldn't undo", description: errorMessage(e), variant: "destructive" });
    }
  }

  if (!inbox) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email a schedule
        </CardTitle>
        <CardDescription>
          Forward a soccer, band or school schedule to your private address. A PDF, screenshot, .ics file or pasted text
          all work. TimeIQ adds the events to a &ldquo;From email&rdquo; calendar so nobody books over them, and replies
          with what it added. Cc the same address on any email thread about meeting up, and TimeIQ finds a time with
          everyone on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-muted/40 px-3 py-2 text-sm break-all">{inbox.address}</code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          {confirmNew ? (
            <span className="flex items-center gap-2 text-sm">
              The old address will stop working.
              <Button size="sm" variant="destructive" onClick={newAddress}>Replace it</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>Cancel</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmNew(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              New address
            </Button>
          )}
        </div>
        {!inbox.enabled && (
          <p className="text-sm text-amber-700">Email imports aren&apos;t switched on for this server yet.</p>
        )}

        {inbox.imports.length > 0 && (
          <div className="divide-y rounded-md border">
            {inbox.imports.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.subject || "(no subject)"}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(item.created_at), "MMM d, h:mm a")}
                    {item.sender ? ` · from ${item.sender}` : ""}
                    {item.status === "rejected" && item.error ? ` · ${item.error}` : ""}
                  </p>
                </div>
                <Badge variant={item.status === "imported" ? "secondary" : "outline"}>
                  {item.status === "imported" ? `${item.event_count} added` : STATUS[item.status]}
                </Badge>
                {item.status === "imported" && (
                  <Button size="sm" variant="outline" onClick={() => undo(item)}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    Undo
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
