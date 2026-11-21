"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { Plus, UsersRound, CheckCircle2, Clock, XCircle, Mail, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { EmailChips, splitEmails } from "@/components/clients/email-chips";
import { apiFetch } from "@/lib/api";
import { viewerZone, whenLabel, type MeetingDetail, type MeetingSummary } from "@/lib/group-meetings";

const DURATIONS = [15, 30, 45, 60, 90, 120];

function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function blankForm() {
  const today = new Date();
  const end = new Date(today.getTime() + 6 * 86_400_000);
  return {
    title: "",
    duration: 30,
    start: isoDate(today),
    end: isoDate(end),
    people: "",
    note: "",
    location: "",
    sendInvites: true,
  };
}

function StatusBadge({ m }: { m: MeetingSummary }) {
  const t = useTranslations("meetings");
  if (m.status === "booked")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        <CheckCircle2 className="h-3 w-3" /> {t("booked")}
      </span>
    );
  if (m.status === "cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        <XCircle className="h-3 w-3" /> {t("cancelled")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
      <Clock className="h-3 w-3" /> {t("answered", { done: m.responded_count, total: m.participant_count })}
    </span>
  );
}

export default function MeetingsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("meetings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    try {
      setMeetings(await apiFetch<MeetingSummary[]>("/api/group-meetings", { headers: { Authorization: `Bearer ${token}` } }));
    } catch {
      setMeetings([]);
    }
  }, [getToken]);

  useEffect(() => {
    // Loads only after an await, so state is never set synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      try {
        const inbox = await apiFetch<{ agent_address: string; enabled: boolean }>("/api/email-imports", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (inbox.enabled) setAddress(inbox.agent_address);
      } catch {
        // The cc tip is optional.
      }
    })();
  }, [getToken]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t("copyFailed"), description: address });
    }
  }

  async function create() {
    setError(null);
    const emails = splitEmails(form.people);
    if (!form.title.trim()) return setError(t("needTitle"));
    if (!emails.length) return setError(t("needPeople"));
    setSaving(true);
    try {
      const token = await getToken();
      const m = await apiFetch<MeetingDetail>("/api/group-meetings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          duration_minutes: form.duration,
          window_start: form.start,
          window_end: form.end,
          participants: emails.map((email) => ({ email })),
          note: form.note || null,
          location: form.location || null,
          send_invites: form.sendInvites,
        }),
      });
      toast({
        title: form.sendInvites ? t("invitesSent") : t("created"),
        description: form.sendInvites ? t("invitesSentBody", { count: m.participants.length }) : t("createdBody"),
      });
      setOpen(false);
      setForm(blankForm());
      router.push(`/meetings/${m.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("createFailed"));
    } finally {
      setSaving(false);
    }
  }

  const zone = viewerZone();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            {t("subtitle")}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {t("findTime")}
        </Button>
      </div>

      {address && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-orange-50/60 px-4 py-3 text-sm">
          <Mail className="h-4 w-4 shrink-0 text-orange-700" />
          <span className="min-w-0 flex-1">
            {t.rich("ccTip", {
              address,
              b: (chunks) => <span className="font-medium">{chunks}</span>,
              code: (chunks) => <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs break-all">{chunks}</code>,
            })}
          </span>
          <Button size="sm" variant="outline" onClick={copyAddress}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? tc("copied") : tc("copy")}
          </Button>
        </div>
      )}

      {meetings === null ? (
        <div className="flex justify-center py-16">
          <ClockLoader />
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <UsersRound className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold">{t("emptyTitle")}</div>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {t("emptyBody")}
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> {t("findTime")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <Card className="transition-colors hover:bg-foreground/[0.02]">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{m.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {m.status === "booked" && m.starts_at
                        ? whenLabel(m.starts_at, m.duration_minutes, zone, locale)
                        : t("summary", { minutes: m.duration_minutes, people: m.participant_count + 1 })}
                      {m.source === "email" && ` · ${t("fromEmail")}`}
                    </div>
                  </div>
                  <StatusBadge m={m} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("findTime")}</DialogTitle>
            <DialogDescription>
              {t("dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="gm-title">{t("whatFor")}</Label>
              <Input
                id="gm-title"
                placeholder={t("titlePlaceholder")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gm-people">{t("whoInvited")}</Label>
              <EmailChips id="gm-people" value={form.people} onChange={(people) => setForm({ ...form, people })} />
              <p className="text-xs text-muted-foreground">{t("whoHelp")}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t("length")}</Label>
                <Select value={String(form.duration)} onValueChange={(v) => setForm({ ...form, duration: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d < 60 ? t("minutesShort", { count: d }) : t("hoursShort", { count: d / 60 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gm-start">{t("from")}</Label>
                <Input id="gm-start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gm-end">{t("to")}</Label>
                <Input id="gm-end" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gm-location">{t("where")}</Label>
              <Input
                id="gm-location"
                placeholder={t("wherePlaceholder")}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gm-note">{t("note")}</Label>
              <Textarea id="gm-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span>
                {t("emailNow")}
                <span className="block text-xs text-muted-foreground">{t("emailNowHelp")}</span>
              </span>
              <Switch checked={form.sendInvites} onCheckedChange={(sendInvites) => setForm({ ...form, sendInvites })} />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? t("creating") : form.sendInvites ? t("sendInvites") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
