"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClockLoader } from "@/components/ui/clock-loader";
import { apiFetch } from "@/lib/api";
import { byDay, dayLabel, timeLabel, viewerZone, whenLabel, type PublicMeeting } from "@/lib/group-meetings";

type Translate = ReturnType<typeof useTranslations<"meet">>;

function zoneAbbr(zone: string, at: Date, locale: string): string {
  return (
    new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? zone
  );
}

/** Zone names the listed times use, in order: one ("EST"), or more when the clocks change in the range. */
function slotAbbrs(zone: string, starts: string[], locale: string): string[] {
  return [...new Set([...starts].sort().map((s) => zoneAbbr(zone, new Date(s), locale)))];
}

/** "Times in your time zone (EST)", or the zone's city and each name when the range crosses a clock change. */
function zoneHeading(zone: string, starts: string[], locale: string, t: Translate): string {
  const abbrs = slotAbbrs(zone, starts.length ? starts : [new Date().toISOString()], locale);
  if (abbrs.length === 1) return t("zone", { zone: abbrs[0] });
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  return t("zoneChanging", { city, first: abbrs[0], second: abbrs.slice(1).join(", ") });
}

function GetTimeIQ() {
  const t = useTranslations("meet.promo");
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.15em] text-[hsl(var(--aurora-1))]">
        <Sparkles className="h-3.5 w-3.5" /> {t("eyebrow")}
      </div>
      <div className="mt-2 text-lg font-semibold">{t("title")}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("body")}
      </p>
      <Link href="/?ref=meet" className="mt-4 inline-block">
        <Button size="sm">
          {t("cta")} <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

/** How many people the time works for, counting the viewer's own pick. */
function fitsLabel(n: number, people: number, t: Translate): string {
  return n >= people ? t("fitsEveryone") : t("fitsSome", { n, people });
}

export default function MeetInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { isSignedIn, getToken } = useAuth();
  const t = useTranslations("meet");
  const tc = useTranslations("common");
  const locale = useLocale();
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
      .catch((e) => setError(e instanceof Error ? e.message : t("invalidLink")));
  }, [token, accept, t]);

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
      setError(e instanceof Error ? e.message : t("saveFailed"));
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
      setError(e instanceof Error ? e.message : t("shareFailed"));
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
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("bookedTitle", { title: m.title })}</h1>
          <p className="mt-2 text-lg">{whenLabel(m.starts_at, m.duration_minutes, zone, locale)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("bookedInvite", { email: m.me_email })} {m.location ? t("where", { location: m.location }) : ""}
          </p>
        </div>
        <GetTimeIQ />
      </div>
    );
  } else if (m.status === "cancelled") {
    content = (
      <div className="space-y-6">
        <div className="glass rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t("cancelledTitle", { organizer: m.organizer_name, title: m.title })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("cancelledBody")}</p>
        </div>
        <GetTimeIQ />
      </div>
    );
  } else {
    const days = byDay(m.slots, zone, locale);
    // When the listed range crosses a clock change, each day names its own zone abbreviation.
    const mixedZones = slotAbbrs(zone, m.slots.map((s) => s.start), locale).length > 1;
    const others = m.people - 1;
    content = (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{t("findingTime", { organizer: m.organizer_name })}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{m.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("minutes", { count: m.duration_minutes })} · {t("people", { count: m.people })} · {t("answered", { answered: m.answered, people: m.people })}
            {m.location ? ` · ${m.location}` : ""}
          </p>
          {m.note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/60 px-4 py-3 text-sm">{m.note}</p>}
        </div>

        {!editing ? (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              <div className="mt-2 text-lg font-semibold">
                {m.uses_calendar ? t("calendarShared") : t("thanks")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.uses_calendar
                  ? t("calendarSharedBody", { organizer: m.organizer_name })
                  : t("thanksBody", { organizer: m.organizer_name, email: m.me_email })}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing(true)}>
                {t("changeAnswer")}
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
                    <div className="font-medium">{t("onTimeIQ")}</div>
                    <div className="text-muted-foreground">{t("onTimeIQBody")}</div>
                  </div>
                </div>
                {isSignedIn ? (
                  <Button size="sm" onClick={useCalendar} disabled={busy}>
                    {t("useCalendar")}
                  </Button>
                ) : (
                  <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/meet/${token}`)}`}>
                    <Button size="sm" variant="outline">
                      {tc("signIn")}
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {!showAll && (
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{t("suggestedTitle")}</h2>
                  <span className="text-xs text-muted-foreground">{zoneHeading(zone, m.suggested, locale, t)}</span>
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
                          <span className="block font-semibold">{dayLabel(start, zone, locale)}</span>
                          <span className={`block text-sm ${on ? "text-background/75" : "text-muted-foreground"}`}>
                            {whenLabel(start, m.duration_minutes, zone, locale).slice(dayLabel(start, zone, locale).length + 2)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          {others > 0 && slot && (
                            <span className={on ? "text-background/70" : "text-muted-foreground"}>
                              {fitsLabel(slot.can_make_it + (on && !slot.mine ? 1 : 0) - (!on && slot.mine ? 1 : 0), m.people, t)}
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
                  {t("pickDifferent")}
                </button>
              </div>
            )}

            {showAll && (
            <div>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{t("allTitle")}</h2>
                <span className="text-xs text-muted-foreground">{zoneHeading(zone, m.slots.map((s) => s.start), locale, t)}</span>
              </div>
              {days.length === 0 ? (
                <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">
                  {t("noTimesLeft", { organizer: m.organizer_name })}
                </p>
              ) : (
                <div className="space-y-4">
                  {days.map((d) => (
                    <div key={d.day}>
                      <div className="mb-2 text-sm font-medium">
                        {d.day}
                        {mixedZones && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {slotAbbrs(zone, d.slots.map((s) => s.start), locale).join(" / ")}
                          </span>
                        )}
                      </div>
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
                              <span className="block font-mono tabular-nums">{timeLabel(s.start, zone, locale)}</span>
                              {others > 0 && (
                                <span className={`block text-[10px] ${on ? "text-background/70" : "text-muted-foreground"}`}>
                                  {fitsLabel(s.can_make_it + (on && !s.mine ? 1 : 0) - (!on && s.mine ? 1 : 0), m.people, t)}
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
                  {t("backToSuggested")}
                </button>
              )}
            </div>
            )}

            <div className="glass sticky bottom-4 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                {!m.me_name && (
                  <Input
                    className="max-w-[14rem] bg-white"
                    placeholder={t("yourName")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label={t("yourName")}
                  />
                )}
                <Button onClick={() => submit([...picks])} disabled={busy || picks.size === 0}>
                  {busy ? tc("saving") : picks.size ? t("send", { count: picks.size }) : t("pickSome")}
                </Button>
                <Button variant="ghost" onClick={() => submit([])} disabled={busy}>
                  {t("noneWork")}
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
