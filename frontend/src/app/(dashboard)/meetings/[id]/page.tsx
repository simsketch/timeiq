"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
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
  if (value === true)
    return (
      <span title={`${who}: can make it`} className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (value === false)
    return (
      <span title={`${who}: can't make it`} className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span title={`${who}: hasn't answered`} className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
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
      toast({ title: "That didn't work", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
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
      toast({ title: `Copied ${who}'s link` });
    } catch {
      toast({ title: "Couldn't copy", description: link });
    }
  }

  async function remind() {
    setBusy(true);
    try {
      const r = await call<{ reminded: number }>(`/api/group-meetings/${id}/remind`, { method: "POST" });
      toast({ title: r.reminded ? `Reminded ${r.reminded} ${r.reminded === 1 ? "person" : "people"}` : "Everyone has answered" });
    } catch (e) {
      toast({ title: "Couldn't send reminders", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
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
      toast({ title: "Couldn't delete", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Group meetings
        </Link>
        <p>That meeting doesn&apos;t exist, or it isn&apos;t yours.</p>
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
        <ArrowLeft className="h-4 w-4" /> Group meetings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight break-words">{m.title}</h1>
          <p className="text-muted-foreground mt-2">
            {m.duration_minutes} min · {total + 1} people
            {m.location ? ` · ${m.location}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.status === "open" && waiting > 0 && (
            <Button variant="outline" onClick={remind} disabled={busy}>
              <Bell className="h-4 w-4" /> Remind {waiting}
            </Button>
          )}
          {m.status !== "cancelled" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act(`/api/group-meetings/${id}/cancel`, { method: "POST" }, m.status === "booked" ? "Cancelled; invites withdrawn" : "Meeting cancelled")}
            >
              <XCircle className="h-4 w-4" /> Cancel meeting
            </Button>
          )}
          {m.status !== "booked" && (
            <Button variant="ghost" disabled={busy} onClick={remove} aria-label="Delete meeting">
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
              <div className="font-semibold text-emerald-900">{whenLabel(m.starts_at, m.duration_minutes, zone)}</div>
              <div className="text-sm text-emerald-900/75">Booked. Everyone got a calendar invite, and it&apos;s blocking time on every TimeIQ calendar involved.</div>
            </div>
          </CardContent>
        </Card>
      )}
      {m.status === "cancelled" && (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">This meeting was cancelled.</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {m.status === "open" && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">Best times</CardTitle>
              <p className="text-sm text-muted-foreground">
                Times you&apos;re free, ranked by how many people can make them. Booking sends everyone an invite.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {m.slots.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You have no free time in this range. Check your working hours on the Availability page, or cancel and
                  pick other days.
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
                      <div className="text-sm font-medium tabular-nums">{whenLabel(s.start, m.duration_minutes, zone)}</div>
                      <div className="text-xs text-muted-foreground">
                        {everyone ? "Everyone can make it" : `${s.yes} of ${total} can make it`}
                        {s.pending > 0 && ` · ${s.pending} waiting`}
                        {i === 0 && !everyone && s.yes > 0 && " · best so far"}
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
                          Back
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/api/group-meetings/${id}/book`,
                              { method: "POST", body: JSON.stringify({ starts_at: s.start }) },
                              "Booked; invites sent"
                            )
                          }
                        >
                          Book &amp; send invites
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant={everyone ? "default" : "outline"} onClick={() => setConfirming(s.start)}>
                        Book
                      </Button>
                    )}
                  </div>
                );
              })}
              {m.slots.length > SHOWN && (
                <button type="button" className="text-sm font-medium text-indigo-700 hover:underline" onClick={() => setShowAll(!showAll)}>
                  {showAll ? "Show fewer" : `Show all ${m.slots.length} times`}
                </button>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={m.status === "open" ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="text-lg">People</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">You</div>
                <div className="text-xs text-muted-foreground">Your calendars, live</div>
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
                    {p.uses_calendar ? "Shared their TimeIQ calendar" : p.responded ? "Picked times" : "Waiting"}
                    {p.name ? ` · ${p.email}` : ""}
                  </div>
                </div>
                {m.status === "open" && (
                  <>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copy(p.link, personLabel(p))} aria-label={`Copy ${personLabel(p)}'s link`}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {total > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={busy}
                        onClick={() => act(`/api/group-meetings/${id}/participants/${p.id}`, { method: "DELETE" }, "Removed")}
                        aria-label={`Remove ${personLabel(p)}`}
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
                    "Invite sent"
                  );
                  if (ok) setNewEmail("");
                }}
              >
                <Input type="email" placeholder="Add someone by email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Button type="submit" size="icon" variant="outline" disabled={busy} aria-label="Add person">
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
