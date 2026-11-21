"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
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

/** Calendars page card: the address to email schedules to, and recent imports. */
export function EmailSchedules({ onChange }: { onChange?: () => void }) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const t = useTranslations("emailSchedules");
  const tc = useTranslations("common");
  const locale = useLocale();
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
      toast({ title: t("copyFailed"), description: t("copyFailedBody"), variant: "destructive" });
    }
  }

  async function changeAlias(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      await call(path, method, body);
      setAliases(await call<EmailAlias[]>("/api/email-aliases"));
      if (method === "POST") {
        setEmail("");
        toast({ title: t("checkEmail"), description: t("checkEmailBody") });
      }
    } catch (e) {
      toast({ title: t("updateFailed"), description: errorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function newAddress() {
    try {
      setInbox(await call<Inbox>("/api/email-imports/address", "POST"));
      setConfirmNew(false);
      toast({ title: t("newReady"), description: t("newReadyBody") });
    } catch (e) {
      toast({ title: t("changeFailed"), description: errorMessage(e), variant: "destructive" });
    }
  }

  async function undo(item: EmailImport) {
    try {
      const r = await call<{ removed: number }>(`/api/email-imports/${item.id}/undo`, "POST");
      setInbox(await call<Inbox>("/api/email-imports"));
      toast({ title: t("removed", { count: r.removed }) });
      onChange?.();
    } catch (e) {
      toast({ title: t("undoFailed"), description: errorMessage(e), variant: "destructive" });
    }
  }

  if (!inbox) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("ccHeading")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted/40 px-3 py-2 text-sm break-all">{inbox.agent_address}</code>
            <Button size="sm" variant="outline" onClick={() => copy(inbox.agent_address)}>
              {copied === inbox.agent_address ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === inbox.agent_address ? tc("copied") : tc("copy")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("ccHelp")}</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("linked")}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="break-all">{inbox.account_email}</span><Badge variant="secondary">{t("accountEmail")}</Badge>
          </div>
          {aliases.map((alias) => (
            <div key={alias.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 break-all">{alias.email}</span>
              <Badge variant={alias.verified_at ? "secondary" : "outline"}>{alias.verified_at ? t("verified") : t("pending")}</Badge>
              {!alias.verified_at && <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeAlias(`/api/email-aliases/${alias.id}/resend`, "POST")}>{t("resend")}</Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeAlias(`/api/email-aliases/${alias.id}`, "DELETE")}>{tc("remove")}</Button>
            </div>
          ))}
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); changeAlias("/api/email-aliases", "POST", { email }); }}>
            <Input type="email" aria-label={t("linkLabel")} placeholder={t("linkPlaceholder")} required value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-48 flex-1" disabled={busy || aliases.length >= 10} />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !email.trim() || aliases.length >= 10}>{t("addAddress")}</Button>
          </form>
          <p className="text-xs text-muted-foreground">{t("linkHelp")}</p>
        </div>
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{t("privateHeading")}</p>
          <p className="text-sm text-muted-foreground">{t("privateHelp")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted/40 px-3 py-2 text-sm break-all">{inbox.address}</code>
            <Button size="sm" variant="outline" onClick={() => copy(inbox.address)}>
              {copied === inbox.address ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === inbox.address ? tc("copied") : tc("copy")}
            </Button>
            {confirmNew ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {t("oldStops")}
                <Button size="sm" variant="destructive" onClick={newAddress}>{t("replace")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>{tc("cancel")}</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmNew(true)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("newAddress")}
              </Button>
            )}
          </div>
        </div>
        {!inbox.enabled && (
          <p className="text-sm text-amber-700">{t("disabled")}</p>
        )}

        {inbox.imports.length > 0 && (
          <div className="divide-y rounded-md border">
            {inbox.imports.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.subject || t("noSubject")}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(item.created_at).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {item.sender ? ` · ${t("from", { sender: item.sender })}` : ""}
                    {item.status === "rejected" && item.error ? ` · ${item.error}` : ""}
                  </p>
                </div>
                <Badge variant={item.status === "imported" ? "secondary" : "outline"}>
                  {item.status === "imported" ? t("added", { count: item.event_count }) : t(`status.${item.status}`)}
                </Badge>
                {item.status === "imported" && (
                  <Button size="sm" variant="outline" onClick={() => undo(item)}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    {t("undo")}
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
