"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar, Clock, ArrowRight, Plus, Copy, Check,
  CalendarDays, ExternalLink
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ShareAvailability } from "@/components/share-availability";
import { startOfWeek } from "date-fns";
import { CalEvent, ViewToggle, WeekCalendar, colorFor, useCalendarView } from "@/components/week-calendar";
import Link from "next/link";
import { ClockLoader } from "@/components/ui/clock-loader";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { AssistantChat } from "@/components/dashboard/assistant-chat";
import { MoneyStats, fmtMoney } from "@/lib/invoicing";
import { Timer, Receipt, Wallet, BadgeCheck } from "lucide-react";

interface Booking {
  id: number;
  visitor_name: string;
  visitor_email: string;
  starts_at: string;
  ends_at: string;
  event_type_id: number;
}

interface CalendarEvent {
  id: number;
  title: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  calendar_source_id: string;
  source_name: string | null;
}

interface CalendarSourceItem {
  id: string;
  name: string;
  is_active: boolean;
}

/** One row in "Upcoming meetings": a TimeIQ booking or a synced calendar event. */
interface UpcomingItem {
  key: string;
  title: string;
  subtitle: string;
  starts_at: string;
  all_day: boolean;
  booking: boolean;
}

interface Stats {
  upcoming_bookings: number;
  total_event_types: number;
}

type MoneyField = "unbilled_amount" | "outstanding_amount" | "paid_this_month";

interface CurrencyMoney {
  currency: string;
  unbilled_amount: number;
  outstanding_amount: number;
  outstanding_count: number;
  paid_this_month: number;
}

/** /api/dashboard/money: top-level amounts are the primary currency only;
 * `by_currency` lists every currency with activity, primary first. */
type DashboardMoney = MoneyStats & { by_currency?: CurrencyMoney[] };

/** Formatted amounts for one tile: the primary currency always, then each
 * other currency that has a nonzero amount. Currencies are never summed. */
function amountsFor(money: DashboardMoney, field: MoneyField, locale: string): string[] {
  const rows = money.by_currency?.length
    ? money.by_currency
    : [{ currency: money.currency, [field]: money[field] } as unknown as CurrencyMoney];
  return rows
    .filter((row, i) => i === 0 || row[field] !== 0)
    .map((row) => fmtMoney(row[field], row.currency, locale));
}

interface UserProfile {
  username: string;
  name: string | null;
  email: string;
}

export default function DashboardPage() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [stats, setStats] = useState<Stats>({ upcoming_bookings: 0, total_event_types: 0 });
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const router = useRouter();
  const [view, setView] = useCalendarView("dashboard");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [synced, setSynced] = useState<CalendarEvent[]>([]);
  const [sources, setSources] = useState<CalendarSourceItem[]>([]);
  const onRangeChange = useCallback((start: Date, end: Date) => setRange({ start, end }), []);

  // Synced events for whichever week or month the calendar shows.
  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const q = `start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`;
        const evs = await apiFetch<CalendarEvent[]>(`/api/calendars/cached-events?${q}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled) setSynced(evs);
      } catch {
        if (!cancelled) setSynced([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, getToken]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [money, setMoney] = useState<DashboardMoney | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [statsData, bookingsData, profileData, moneyData, eventsData, sourcesData] = await Promise.all([
          apiFetch<Stats>("/api/dashboard/stats", { headers }),
          apiFetch<Booking[]>("/api/bookings?status=confirmed", { headers }),
          apiFetch<UserProfile>("/api/me", { headers }),
          apiFetch<DashboardMoney>("/api/dashboard/money", { headers }).catch(() => null),
          // Calendar events are a bonus; a sync problem must not blank the dashboard.
          apiFetch<CalendarEvent[]>("/api/calendars/cached-events?days=14", { headers }).catch(() => []),
          apiFetch<CalendarSourceItem[]>("/api/calendars", { headers }).catch(() => []),
        ]);
        setSources(sourcesData.filter((c) => c.is_active));
        setStats(statsData);
        setMoney(moneyData);
        setBookings(bookingsData);

        const now = new Date();
        const upcoming = bookingsData.filter(b => new Date(b.starts_at) >= now);
        const past = bookingsData
          .filter(b => new Date(b.starts_at) < now)
          .reverse(); // most recent past first
        // A booking can also be synced back from the host's calendar; show it once, as the booking.
        const bookingStarts = new Set(upcoming.map(b => new Date(b.starts_at).getTime()));
        const items: UpcomingItem[] = [
          ...upcoming.map(b => ({
            key: `b${b.id}`, title: b.visitor_name, subtitle: b.visitor_email,
            starts_at: b.starts_at, all_day: false, booking: true,
          })),
          ...eventsData
            .filter(e => !bookingStarts.has(new Date(e.starts_at).getTime()))
            .map(e => ({
              key: `e${e.id}`, title: e.title || t("busy"), subtitle: e.source_name || t("calendar"),
              starts_at: e.starts_at, all_day: e.is_all_day, booking: false,
            })),
        ].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        setUpcoming(items.slice(0, 6));
        setPastBookings(past.slice(0, 5));
        setProfile(profileData);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [getToken, t]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  }

  async function copyLink() {
    if (!profile) return;
    const url = `${window.location.origin}/book/${profile.username}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user?.firstName ? t("greeting", { part: greeting, name: user.firstName }) : t("greetingNoName", { part: greeting })}
          </h1>
          <p className="text-muted-foreground mt-2">
            {new Date().toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/event-types">
            <Plus className="mr-2 h-4 w-4" />
            {t("newEventType")}
          </Link>
        </Button>
      </div>

      <AssistantChat firstName={user?.firstName} />

      <OnboardingChecklist />

      {/* Share link card, at the top */}
      {profile && (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex min-w-0 flex-[1_1_18rem] items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white">
                  <ExternalLink className="h-5 w-5 text-gray-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("yourBookingLink")}
                  </p>
                  <p className="text-sm font-mono break-all">
                    timeiq.app/book/{profile.username}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
              <ShareAvailability />
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {tc("copied")}
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    {tc("copy")}
                  </>
                )}
              </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Money grid */}
      {money && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: t("hoursThisWeek"),
              values: [t("hours", { hours: money.hours_this_week.toFixed(1) })],
              sub: money.weekly_hours_target ? t("ofTarget", { hours: money.weekly_hours_target }) : "",
              icon: Timer,
              href: "/time",
              tone: "text-[hsl(var(--aurora-2))] bg-[hsl(var(--aurora-2)/0.12)]",
            },
            {
              label: t("unbilled"),
              values: amountsFor(money, "unbilled_amount", locale),
              sub: t("readyToInvoice"),
              icon: Wallet,
              href: "/invoices",
              tone: "text-[hsl(var(--aurora-1))] bg-[hsl(var(--aurora-1)/0.12)]",
            },
            {
              label: t("outstanding"),
              values: amountsFor(money, "outstanding_amount", locale),
              sub: (() => {
                const n = money.by_currency?.length
                  ? money.by_currency.reduce((sum, row) => sum + row.outstanding_count, 0)
                  : money.outstanding_count;
                return t("sentInvoices", { count: n });
              })(),
              icon: Receipt,
              href: "/invoices",
              tone: "text-[hsl(var(--aurora-5))] bg-[hsl(var(--aurora-5)/0.12)]",
            },
            {
              label: t("paidThisMonth"),
              values: amountsFor(money, "paid_this_month", locale),
              sub: new Date().toLocaleDateString(locale, { month: "long" }),
              icon: BadgeCheck,
              href: "/invoices",
              tone: "text-[hsl(var(--aurora-4))] bg-[hsl(var(--aurora-4)/0.12)]",
            },
          ].map((tile) => (
            <Link key={tile.label} href={tile.href}>
              <Card className="h-full hover:bg-muted/30 transition">
                <CardContent className="p-5">
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg mb-3 ${tile.tone}`}>
                    <tile.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-muted-foreground">{tile.label}</p>
                  <p className="text-2xl font-bold tracking-tight tabular-nums">{tile.values[0]}</p>
                  {tile.values.slice(1).map((other) => (
                    <p key={other} className="text-base font-semibold tracking-tight tabular-nums">
                      + {other}
                    </p>
                  ))}
                  {tile.sub && <p className="text-xs text-muted-foreground mt-1">{tile.sub}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                <CalendarDays className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("upcomingBookings")}
                </p>
                <p className="text-3xl font-bold">{stats.upcoming_bookings}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
                <Clock className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("eventTypes")}
                </p>
                <p className="text-3xl font-bold">{stats.total_event_types}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming meetings card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{view === "calendar" ? t("yourWeek") : t("upcomingMeetings")}</CardTitle>
              <CardDescription>{t("upcomingDescription")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/bookings">
                {t("viewAll")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === "calendar" ? (
            <WeekCalendar
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              calendars={[
                { id: "bookings", name: t("timeiqBookings"), color: "hsl(var(--aurora-1))" },
                ...sources.map((c) => ({ id: c.id, name: c.name, color: colorFor(c.id) })),
              ]}
              events={[
                ...synced.map((e) => ({
                  id: `e${e.id}`,
                  title: e.title || t("busy"),
                  start: new Date(e.starts_at),
                  end: new Date(e.ends_at),
                  allDay: e.is_all_day,
                  color: colorFor(e.calendar_source_id),
                  label: e.source_name ?? undefined,
                  calendarId: e.calendar_source_id,
                })),
                ...bookings.map((b) => ({
                  id: `b${b.id}`,
                  title: b.visitor_name,
                  start: new Date(b.starts_at),
                  end: new Date(b.ends_at),
                  color: colorFor(String(b.event_type_id)),
                  calendarId: "bookings",
                  details: [b.visitor_email],
                  href: `/bookings?booking=${b.id}`,
                })),
              ]}
              onRangeChange={onRangeChange}
              emptyHint={t("nothingThisWeek")}
            />
          ) : upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
                <Calendar className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t("noUpcoming")}</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                {t("noUpcomingHint")}
              </p>
              <Button asChild variant="outline">
                <Link href="/event-types">
                  {t("createEventType")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {upcoming.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    {item.booking ? (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-semibold text-white">
                        {getInitials(item.title)}
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">
                      {new Date(item.starts_at).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.all_day ? t("allDay") : new Date(item.starts_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past meetings card */}
      {pastBookings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-muted-foreground">{t("pastMeetings")}</CardTitle>
                <CardDescription>{t("pastDescription")}</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/bookings">
                  {t("viewAll")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pastBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-500">
                      {getInitials(booking.visitor_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{booking.visitor_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {booking.visitor_email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">
                      {new Date(booking.starts_at).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(booking.starts_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
