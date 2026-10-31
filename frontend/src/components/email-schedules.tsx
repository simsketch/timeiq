"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { Check, Copy, Mail, RotateCcw, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
    | "meeting_accepted"
    | "meeting_error"
    | "ignored"
    | "skipped";
  event_count: number;
  error: string | null;
  created_at: string;
}

interface Inbox {
  address: string;
  agent_address: string;
  account_email: string;
  enabled: boolean;
  imports: EmailImport[];
}

interface EmailAlias {
  id: string;
  email: string;
  verified_at: string | null;
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
  meeting_accepted: "Accepted a time",
  meeting_error: "Error",
  ignored: "Ignored",
  skipped: "Not read: subscription inactive",
};

/** Calendars page card: the address to email schedules to, and recent imports. */
export function EmailSchedules({ onChange }: { onChange?: () => void }) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [aliases, setAliases] = useState<EmailAlias[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const call = useCallback(
    async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
      const token = await getToken();
      return apiFetch<T>(path, { method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${token}` } });
    },
    [getToken]
  );

  useEffect(() => {
    Promise.all([call<Inbox>("/api/email-imports"), call<EmailAlias[]>("/api/email-aliases")])
      .then(([inbox, aliases]) => { setInbox(inbox); setAliases(aliases); })
      .catch(() => setInbox(null));
  }, [call]);

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "Couldn't copy the address", description: "Select the address and copy it manually.", variant: "destructive" });
    }
  }

  async function changeAlias(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      await call(path, method, body);
      setAliases(await call<EmailAlias[]>("/api/email-aliases"));
      if (method === "POST") {
        setEmail("");
        toast({ title: "Check your email", description: "Open the confirmation link to verify this address." });
      }
    } catch (e) {
      toast({ title: "Couldn't update the address", description: errorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
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
          Forward a soccer, band or school schedule from your own email to TimeIQ. A PDF, screenshot, .ics file or pasted text
          all work. TimeIQ adds the events to a &ldquo;From email&rdquo; calendar so nobody books over them, and replies
          with what it added. Cc the agent on any email thread about meeting up, and TimeIQ finds a time with
          everyone on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Cc or forward from your own email</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted/40 px-3 py-2 text-sm break-all">{inbox.agent_address}</code>
            <Button size="sm" variant="outline" onClick={() => copy(inbox.agent_address)}>
              {copied === inbox.agent_address ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === inbox.agent_address ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Send from your account email or a verified linked address below.</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Linked addresses</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="break-all">{inbox.account_email}</span><Badge variant="secondary">Account email</Badge>
          </div>
          {aliases.map((alias) => (
            <div key={alias.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 break-all">{alias.email}</span>
              <Badge variant={alias.verified_at ? "secondary" : "outline"}>{alias.verified_at ? "Verified" : "Pending confirmation"}</Badge>
              {!alias.verified_at && <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeAlias(`/api/email-aliases/${alias.id}/resend`, "POST")}>Resend</Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeAlias(`/api/email-aliases/${alias.id}`, "DELETE")}>Remove</Button>
            </div>
          ))}
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); changeAlias("/api/email-aliases", "POST", { email }); }}>
            <Input type="email" aria-label="Email address to link" placeholder="you@work.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-48 flex-1" disabled={busy || aliases.length >= 10} />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !email.trim() || aliases.length >= 10}>Add address</Button>
          </form>
          <p className="text-xs text-muted-foreground">You can link up to 10 addresses. Each needs confirmation before the agent can use it.</p>
        </div>
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">For auto-forwards and other people</p>
          <p className="text-sm text-muted-foreground">Keep this private address for automatic forwarding or someone sending schedules on your behalf.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted/40 px-3 py-2 text-sm break-all">{inbox.address}</code>
            <Button size="sm" variant="outline" onClick={() => copy(inbox.address)}>
              {copied === inbox.address ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === inbox.address ? "Copied" : "Copy"}
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
