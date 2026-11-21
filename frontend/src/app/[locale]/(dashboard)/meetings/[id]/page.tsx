"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  Check,
  CheckCircle2,
  Copy,
  HelpCircle,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { personLabel, viewerZone, whenLabel, type MeetingDetail, type MeetingSlot } from "@/lib/group-meetings";

const SHOWN = 8;

function Answer({ value, who }: { value: boolean | null | undefined; who: string }) {
  const t = useTranslations("meetings.detail");
  if (value === true)
    return (
      <span title={t("canMake", { who })} className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (value === false)
    return (
      <span title={t("cantMake", { who })} className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span title={t("noAnswer", { who })} className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("meetings");
  const td = useTranslations("meetings.detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [m, setM] = useState<MeetingDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      const token = await getToken();
      return apiFetch<T>(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
    },
    [getToken]
  );

  const load = useCallback(async () => {
    try {
      setM(await call<MeetingDetail>(`/api/group-meetings/${id}`));
    } catch {
      setNotFound(true);
    }
  }, [call, id]);

  useEffect(() => {
    // Loads only after an await, so state is never set synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(path: string, init: RequestInit, success: string) {
    setBusy(true);
    try {
      const next = await call<MeetingDetail>(path, init);
      setM(next);
      toast({ title: success });
      return true;
    } catch (e) {
      toast({ title: td("failed"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      load();
      return false;
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function copy(link: string, who: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: td("copied", { who }) });
    } catch {
      toast({ title: t("copyFailed"), description: link });
    }
  }

  async function remind() {
    setBusy(true);
    try {
      const r = await call<{ reminded: number }>(`/api/group-meetings/${id}/remind`, { method: "POST" });
      toast({ title: r.reminded ? td("reminded", { count: r.reminded }) : td("everyoneAnswered") });
    } catch (e) {
      toast({ title: td("remindFailed"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!m) return;
    setBusy(true);
    try {
      await call(`/api/group-meetings/${id}`, { method: "DELETE" });
      router.push("/meetings");
    } catch (e) {
      toast({ title: td("deleteFailed"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("title")}
        </Link>
        <p>{td("notFound")}</p>
      </div>
    );
  }
  if (!m) {
    return (
      <div className="flex justify-center py-16">
        <ClockLoader />
      </div>
    );
  }

  const zone = viewerZone();
  const total = m.participants.length;
  const slots: MeetingSlot[] = showAll ? m.slots : m.slots.slice(0, SHOWN);
  const waiting = m.participants.filter((p) => !p.responded).length;

  return (
    <div className="space-y-6">
      <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight break-words">{m.title}</h1>
          <p className="text-muted-foreground mt-2">
            {t("summary", { minutes: m.duration_minutes, people: total + 1 })}
            {m.location ? ` · ${m.location}` : ""}
            {m.source === "email" ? ` · ${td("startedFromEmail")}` : ""}
            {m.source === "accepted" ? ` · ${td("acceptedSource")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.status === "open" && waiting > 0 && (
            <Button variant="outline" onClick={remind} disabled={busy}>
              <Bell className="h-4 w-4" /> {td("remind", { count: waiting })}
            </Button>
          )}
          {m.status !== "cancelled" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act(`/api/group-meetings/${id}/cancel`, { method: "POST" }, m.status === "booked" ? td("cancelledInvitesWithdrawn") : td("meetingCancelled"))}
            >
              <XCircle className="h-4 w-4" /> {td("cancel")}
            </Button>
          )}
          {m.status !== "booked" && (
            <Button variant="ghost" disabled={busy} onClick={remove} aria-label={td("delete")}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {m.status === "booked" && m.starts_at && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex items-center gap-3 py-5">
            <CalendarCheck className="h-6 w-6 shrink-0 text-emerald-700" />
            <div>
              <div className="font-semibold text-emerald-900">{whenLabel(m.starts_at, m.duration_minutes, zone, locale)}</div>
              <div className="text-sm text-emerald-900/75">
                {m.source === "accepted"
                  ? td("acceptedBody")
                  : td("bookedBody")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {m.status === "cancelled" && (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">{td("wasCancelled")}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {m.status === "open" && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">{td("bestTimes")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {td("bestTimesHelp")}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {m.slots.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {td("noFreeTime")}
                </p>
              )}
              {slots.map((s, i) => {
                const everyone = s.yes === total;
                return (
                  <div
                    key={s.start}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      everyone ? "border-emerald-200 bg-emerald-50/50" : ""
                    }`}
                  >
                    <div className="min-w-[11rem] flex-1">
                      <div className="text-sm font-medium tabular-nums">{whenLabel(s.start, m.duration_minutes, zone, locale)}</div>
                      <div className="text-xs text-muted-foreground">
                        {everyone ? td("everyone") : td("someCan", { yes: s.yes, total })}
                        {s.pending > 0 && ` · ${td("waitingCount", { count: s.pending })}`}
                        {i === 0 && !everyone && s.yes > 0 && ` · ${td("bestSoFar")}`}
                      </div>
                    </div>
                    <div className="flex -space-x-1">
                      {m.participants.map((p) => (
                        <Answer key={p.id} value={s.answers[p.id]} who={personLabel(p)} />
                      ))}
                    </div>
                    {confirming === s.start ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          {tc("back")}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/api/group-meetings/${id}/book`,
                              { method: "POST", body: JSON.stringify({ starts_at: s.start }) },
                              td("bookedInvites")
                            )
                          }
                        >
                          {td("bookAndSend")}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant={everyone ? "default" : "outline"} onClick={() => setConfirming(s.start)}>
                        {td("book")}
                      </Button>
                    )}
                  </div>
                );
              })}
              {m.slots.length > SHOWN && (
                <button type="button" className="text-sm font-medium text-orange-700 hover:underline" onClick={() => setShowAll(!showAll)}>
                  {showAll ? td("showFewer") : td("showAll", { count: m.slots.length })}
                </button>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={m.status === "open" ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="text-lg">{td("people")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{td("you")}</div>
                <div className="text-xs text-muted-foreground">{td("yourCalendars")}</div>
              </div>
            </div>
            {m.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                {p.responded ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{personLabel(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.uses_calendar ? td("sharedCalendar") : p.responded ? td("pickedTimes") : td("waiting")}
                    {p.name ? ` · ${p.email}` : ""}
                  </div>
                </div>
                {m.status === "open" && (
                  <>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copy(p.link, personLabel(p))} aria-label={td("copyLink", { who: personLabel(p) })}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {total > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={busy}
                        onClick={() => act(`/api/group-meetings/${id}/participants/${p.id}`, { method: "DELETE" }, td("removed"))}
                        aria-label={td("removePerson", { who: personLabel(p) })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
            {m.status === "open" && (
              <form
                className="flex gap-2 pt-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newEmail.trim()) return;
                  const ok = await act(
                    `/api/group-meetings/${id}/participants`,
                    { method: "POST", body: JSON.stringify({ email: newEmail.trim() }) },
                    td("inviteSent")
                  );
                  if (ok) setNewEmail("");
                }}
              >
                <Input type="email" placeholder={td("addPlaceholder")} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Button type="submit" size="icon" variant="outline" disabled={busy} aria-label={td("addPerson")}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </form>
            )}
            {m.note && <p className="border-t pt-3 text-sm text-muted-foreground whitespace-pre-wrap">{m.note}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
