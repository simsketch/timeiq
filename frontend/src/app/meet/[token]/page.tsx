"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { byDay, dayLabel, timeLabel, viewerZone, whenLabel, type PublicMeeting } from "@/lib/group-meetings";

function zoneAbbr(zone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? zone
  );
}

function GetTimeIQ() {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.15em] text-[hsl(var(--aurora-1))]">
        <Sparkles className="h-3.5 w-3.5" /> Made with TimeIQ
      </div>
      <div className="mt-2 text-lg font-semibold">Schedule your own meetings this way.</div>
      <p className="mt-1 text-sm text-muted-foreground">
        TimeIQ finds a time with anyone, keeps every calendar you use in one booking link, and puts emailed schedules
        (soccer, band, school) on your calendar automatically.
      </p>
      <Link href="/?ref=meet" className="mt-4 inline-block">
        <Button size="sm">
          See how it works <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

export default function MeetInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { isSignedIn, getToken } = useAuth();
  const [m, setM] = useState<PublicMeeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zone] = useState(viewerZone);
  // Lead with three suggested times; the full list sits behind "pick a different time".
  const [showAll, setShowAll] = useState(false);

  const accept = useCallback((data: PublicMeeting) => {
    setM(data);
    const mine = new Set(data.slots.filter((s) => s.mine).map((s) => s.start));
    // A time tapped in the email arrives as ?pick=..., preselected and ready to send.
    const tapped = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pick") : null;
    if (tapped && !data.responded && data.slots.some((s) => s.start === tapped)) mine.add(tapped);
    setPicks(mine);
    setEditing(!data.responded);
    setShowAll(data.suggested.length === 0 || (tapped !== null && !data.suggested.includes(tapped)));
  }, []);

  useEffect(() => {
    apiFetch<PublicMeeting>(`/api/meet/${token}`)
      .then(accept)
      .catch((e) => setError(e instanceof Error ? e.message : "This link isn't valid."));
  }, [token, accept]);

  function toggle(start: string) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });
  }

  async function submit(starts: string[]) {
    setBusy(true);
    setError(null);
    try {
      accept(
        await apiFetch<PublicMeeting>(`/api/meet/${token}/respond`, {
          method: "POST",
          body: JSON.stringify({ name: name || null, available_starts: starts }),
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answer.");
    } finally {
      setBusy(false);
    }
  }

  async function useCalendar() {
    setBusy(true);
    setError(null);
    try {
      const jwt = await getToken();
      accept(
        await apiFetch<PublicMeeting>(`/api/meet/${token}/use-calendar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}` },
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't share your calendar.");
    } finally {
      setBusy(false);
    }
  }

  let content: React.ReactNode;
  if (!m && !error) {
    content = (
      <div className="flex justify-center py-24">
        <ClockLoader />
      </div>
    );
  } else if (!m) {
    content = (
      <div className="glass rounded-2xl p-8 text-center">
        <XCircle className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">{error}</p>
      </div>
    );
  } else if (m.status === "booked" && m.starts_at) {
    content = (
      <div className="space-y-6">
        <div className="glass rounded-2xl p-6 sm:p-8">
          <CalendarCheck className="h-8 w-8 text-emerald-600" />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{m.title} is booked</h1>
          <p className="mt-2 text-lg">{whenLabel(m.starts_at, m.duration_minutes, zone)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The calendar invite is in your email ({m.me_email}). {m.location ? `Where: ${m.location}.` : ""}
          </p>
        </div>
        <GetTimeIQ />
      </div>
    );
  } else if (m.status === "cancelled") {
    content = (
      <div className="space-y-6">
        <div className="glass rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{m.organizer_name} cancelled {m.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Nothing else to do here.</p>
        </div>
        <GetTimeIQ />
      </div>
    );
  } else {
    const days = byDay(m.slots, zone);
    const others = m.people - 1;
    content = (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{m.organizer_name} is finding a time for</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{m.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {m.duration_minutes} minutes · {m.people} people · {m.answered} of {m.people} answered
            {m.location ? ` · ${m.location}` : ""}
          </p>
          {m.note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/60 px-4 py-3 text-sm">{m.note}</p>}
        </div>

        {!editing ? (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              <div className="mt-2 text-lg font-semibold">
                {m.uses_calendar ? "Your TimeIQ calendar is shared for this meeting." : "Thanks, your times are in."}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.uses_calendar
                  ? `Only free and busy times are shared, never what your events are. ${m.organizer_name} will pick a time and you'll get an invite.`
                  : `${m.organizer_name} will pick a time and you'll get a calendar invite at ${m.me_email}.`}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing(true)}>
                Change my answer
              </Button>
            </div>
            <GetTimeIQ />
          </div>
        ) : (
          <>
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 shrink-0 text-[hsl(var(--aurora-1))]" />
                  <div className="text-sm">
                    <div className="font-medium">On TimeIQ? Skip the ticking.</div>
                    <div className="text-muted-foreground">Share your calendar for this meeting in one click. Free/busy only.</div>
                  </div>
                </div>
                {isSignedIn ? (
                  <Button size="sm" onClick={useCalendar} disabled={busy}>
                    Use my TimeIQ calendar
                  </Button>
                ) : (
                  <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/meet/${token}`)}`}>
                    <Button size="sm" variant="outline">
                      Sign in
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {!showAll && (
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">Do any of these work?</h2>
                  <span className="text-xs text-muted-foreground">Times in your time zone ({zoneAbbr(zone)})</span>
                </div>
                <div className="grid gap-2">
                  {m.suggested.map((start) => {
                    const on = picks.has(start);
                    const slot = m.slots.find((x) => x.start === start);
                    return (
                      <button
                        key={start}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(start)}
                        className={`flex items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition-all ${
                          on ? "bg-foreground text-background shadow-lg" : "glass hover:-translate-y-0.5"
                        }`}
                      >
                        <span>
                          <span className="block font-semibold">{dayLabel(start, zone)}</span>
                          <span className={`block text-sm ${on ? "text-background/75" : "text-muted-foreground"}`}>
                            {whenLabel(start, m.duration_minutes, zone).slice(dayLabel(start, zone).length + 2)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          {others > 0 && slot && (
                            <span className={on ? "text-background/70" : "text-muted-foreground"}>
                              {slot.can_make_it + (on && !slot.mine ? 1 : 0) - (!on && slot.mine ? 1 : 0)} of {m.people} free
                            </span>
                          )}
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                              on ? "border-background bg-background text-foreground" : "border-foreground/20"
                            }`}
                          >
                            {on && <CheckCircle2 className="h-4 w-4" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-3 text-sm font-medium text-[hsl(var(--aurora-1))] hover:underline"
                >
                  None of these work? Pick a different time
                </button>
              </div>
            )}

            {showAll && (
            <div>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Tick every time that works for you</h2>
                <span className="text-xs text-muted-foreground">Times in your time zone ({zoneAbbr(zone)})</span>
              </div>
              {days.length === 0 ? (
                <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">
                  {m.organizer_name} has no open times left in this range. Reply to their email to suggest another day.
                </p>
              ) : (
                <div className="space-y-4">
                  {days.map((d) => (
                    <div key={d.day}>
                      <div className="mb-2 text-sm font-medium">{d.day}</div>
                      <div className="flex flex-wrap gap-2">
                        {d.slots.map((s) => {
                          const on = picks.has(s.start);
                          return (
                            <button
                              key={s.start}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggle(s.start)}
                              className={`rounded-xl px-3 py-2 text-left text-sm transition-all ${
                                on
                                  ? "bg-foreground text-background shadow-md"
                                  : "glass text-foreground/85 hover:-translate-y-0.5"
                              }`}
                            >
                              <span className="block font-mono tabular-nums">{timeLabel(s.start, zone)}</span>
                              {others > 0 && (
                                <span className={`block text-[10px] ${on ? "text-background/70" : "text-muted-foreground"}`}>
                                  {s.can_make_it + (on && !s.mine ? 1 : 0) - (!on && s.mine ? 1 : 0)} of {m.people} free
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {m.suggested.length > 0 && (
                <button type="button" onClick={() => setShowAll(false)} className="mt-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                  Back to the suggested times
                </button>
              )}
            </div>
            )}

            <div className="glass sticky bottom-4 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                {!m.me_name && (
                  <Input
                    className="max-w-[14rem] bg-white"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Your name"
                  />
                )}
                <Button onClick={() => submit([...picks])} disabled={busy || picks.size === 0}>
                  {busy ? "Saving…" : picks.size ? `Send ${picks.size} ${picks.size === 1 ? "time" : "times"}` : "Pick some times"}
                </Button>
                <Button variant="ghost" onClick={() => submit([])} disabled={busy}>
                  None of these work
                </Button>
              </div>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <MarketingShell>
      <div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">{content}</div>
    </MarketingShell>
  );
}
