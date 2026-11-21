"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { CalendarSubscriptionCard } from "@/components/calendar-subscription-card";
import { EmailSchedules } from "@/components/email-schedules";
import { apiFetch } from "@/lib/api";
import { FIX_CALENDAR_EVENT } from "@/components/dashboard/calendar-health-banner";
import { Plus, Trash2, RefreshCw, CalendarDays, Clock, AlertTriangle, Link2 } from "lucide-react";
import { startOfWeek } from "date-fns";
import { CalEvent, ViewToggle, WeekCalendar, colorFor, useCalendarView } from "@/components/week-calendar";
import { ClockLoader } from "@/components/ui/clock-loader";

interface Calendar {
  id: string;
  name: string;
  type: string;
  ics_url: string | null;
  last_synced_at: string | null;
  sync_status: "ok" | "failing" | "broken";
  last_sync_error: string | null;
  failing_since: string | null;
}

interface CachedEvent {
  id: string;
  calendar_source_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  source_name: string | null;
}

export default function CalendarsPage() {
  const t = useTranslations("calendars");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [cachedEvents, setCachedEvents] = useState<CachedEvent[]>([]);
  const [view, setView] = useCalendarView("calendars");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekEvents, setWeekEvents] = useState<CachedEvent[]>([]);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [weekVersion, setWeekVersion] = useState(0);
  // What the calendar shows: its week, or six weeks in the month view.
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const onRangeChange = useCallback((start: Date, end: Date) => setRange({ start, end }), []);

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const query = `start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`;
        const evs = await apiFetch<CachedEvent[]>(`/api/calendars/cached-events?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setWeekEvents(evs);
      } catch {
        if (!cancelled) setWeekEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, weekVersion, getToken]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", ics_url: "" });
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [newLink, setNewLink] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  // Google sign-in needs OAuth credentials on the server; hide it until they exist.
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [connectingOutlook, setConnectingOutlook] = useState(false);
  const [outlookAuthUrl, setOutlookAuthUrl] = useState<string | null>(null);
  const outlookEnabled = outlookAuthUrl !== null;

  useEffect(() => {
    apiFetch<{ enabled: boolean }>("/api/google/status")
      .then((s) => setGoogleEnabled(s.enabled))
      .catch(() => setGoogleEnabled(false));
    apiFetch<{ enabled: boolean; auth_url: string }>("/api/microsoft/status")
      .then((s) => setOutlookAuthUrl(s.enabled ? s.auth_url : null))
      .catch(() => setOutlookAuthUrl(null));
  }, []);

  useEffect(() => {
    fetchAll();
    // Google's OAuth callback lands back here with ?google=connected.
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast({
        title: t("toast.googleConnected"),
        description: t("toast.googleConnectedBody"),
      });
      params.delete("google");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    const outlook = params.get("microsoft");
    if (outlook) {
      toast(outlook === "connected" ? {
        title: t("toast.outlookConnected"),
        description: t("toast.outlookConnectedBody"),
      } : outlook === "admin" ? {
        title: t("toast.outlookAdmin"),
        description: t("toast.outlookAdminBody"),
        variant: "destructive",
      } : {
        title: t("toast.outlookFailed"),
        description: t("toast.outlookFailedBody"),
        variant: "destructive",
      });
      params.delete("microsoft");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }, []);

  // "Fix it" in the broken-calendar banner: start this calendar's repair.
  // Each request gets a number so a second click on the same calendar runs again.
  const [fixRequest, setFixRequest] = useState<{ id: string; n: number } | null>(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("fix");
    return id ? { id, n: 0 } : null;
  });
  const fixHandled = useRef(-1);
  useEffect(() => {
    const onFix = (e: Event) => setFixRequest((r) => ({ id: (e as CustomEvent<string>).detail, n: (r?.n ?? 0) + 1 }));
    window.addEventListener(FIX_CALENDAR_EVENT, onFix);
    return () => window.removeEventListener(FIX_CALENDAR_EVENT, onFix);
  }, []);
  useEffect(() => {
    const calendar = fixRequest && fixRequest.n !== fixHandled.current ? calendars.find((c) => c.id === fixRequest.id) : undefined;
    if (!calendar || !fixRequest) return;
    fixHandled.current = fixRequest.n;
    const params = new URLSearchParams(window.location.search);
    if (params.has("fix")) {
      params.delete("fix");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    document.getElementById(`calendar-${calendar.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (calendar.type === "google") handleConnectGoogle();
    else if (calendar.type === "microsoft" && outlookEnabled) handleConnectOutlook();
    else if (calendar.type === "ics_url") {
      setReplacing(calendar.id);
      setNewLink("");
    }
    // The handlers are plain functions recreated each render; the request is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixRequest, calendars, outlookEnabled]);

  async function handleConnectGoogle() {
    setConnectingGoogle(true);
    try {
      const token = await getToken();
      // credentials: "include" keeps the state cookie the OAuth callback checks.
      const { url } = await apiFetch<{ url: string }>("/api/google/auth-url", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: t("toast.googleStartFailed"),
        description: error.message,
        variant: "destructive",
      });
      setConnectingGoogle(false);
    }
  }

  async function handleConnectOutlook() {
    if (!outlookAuthUrl) return;
    setConnectingOutlook(true);
    try {
      const token = await getToken();
      // Set the PKCE cookie on the callback host, even when other API calls
      // use the frontend's same-origin rewrite.
      const { url } = await apiFetch<{ url: string }>(outlookAuthUrl, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      window.location.href = url;
    } catch (error: unknown) {
      toast({
        title: t("toast.outlookStartFailed"),
        description: error instanceof Error ? error.message : t("toast.outlookRetry"),
        variant: "destructive",
      });
      setConnectingOutlook(false);
    }
  }

  async function fetchAll() {
    setWeekVersion((v) => v + 1);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [cals, events] = await Promise.all([
        apiFetch<Calendar[]>("/api/calendars", { headers }),
        apiFetch<CachedEvent[]>("/api/calendars/cached-events?days=14", { headers }),
      ]);
      setCalendars(cals);
      setCachedEvents(events);
    } catch (error) {
      console.error("Failed to fetch calendars:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCalendar(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const token = await getToken();
      await apiFetch("/api/calendars/ics", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      toast({ title: t("toast.added") });
      setFormData({ name: "", ics_url: "" });
      setShowAddForm(false);
      fetchAll();
    } catch (error: any) {
      toast({
        title: t("toast.addFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleReplaceLink(e: React.FormEvent, id: string) {
    e.preventDefault();
    setSavingLink(true);
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ics_url: newLink }),
      });
      toast({ title: t("toast.linkReplaced"), description: t("toast.linkReplacedBody") });
      setReplacing(null);
      setNewLink("");
      fetchAll();
    } catch (error: any) {
      toast({ title: t("toast.linkFailed"), description: error.message, variant: "destructive" });
    } finally {
      setSavingLink(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmRemove"))) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: t("toast.removed") });
      fetchAll();
    } catch (error: any) {
      toast({
        title: tc("error"),
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleSync(id: string) {
    try {
      const token = await getToken();
      await apiFetch(`/api/calendars/${id}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: t("toast.synced") });
    } catch (error: any) {
      toast({
        title: t("toast.syncFailed"),
        description: error.message,
        variant: "destructive",
      });
    }
    fetchAll();
  }

  const [syncingAll, setSyncingAll] = useState(false);

  async function handleSyncAll() {
    setSyncingAll(true);
    try {
      const token = await getToken();
      const result = await apiFetch<{ synced: number; failed: number }>(
        "/api/calendars/sync-all",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast({
        title: t("toast.syncComplete"),
        description: t("toast.syncCompleteBody", { synced: result.synced, failed: result.failed }),
      });
      fetchAll();
    } catch (error: any) {
      toast({
        title: t("toast.syncFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncingAll(false);
    }
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("subtitle")}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("syncExplainer")}
          </p>
        </div>
        {calendars.length > 0 && (
          <Button
            variant="outline"
            onClick={handleSyncAll}
            disabled={syncingAll}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncingAll ? "animate-spin" : ""}`} />
            {syncingAll ? t("syncing") : t("syncAll")}
          </Button>
        )}
      </div>

      {/* Synced events: week calendar by default, list as an option */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t("syncedEvents")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {view === "list" ? t("syncedEventsListHint") : t("syncedEventsHint")}
            </p>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>
        {view === "calendar" ? (
          <>
            <WeekCalendar
              calendars={calendars.map((c) => ({ id: c.id, name: c.name, color: colorFor(c.id) }))}
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              events={weekEvents.map((e) => ({
                id: e.id,
                title: e.title || t("noTitle"),
                start: new Date(e.starts_at),
                end: new Date(e.ends_at),
                allDay: e.is_all_day,
                color: colorFor(e.calendar_source_id),
                label: e.source_name ?? undefined,
                calendarId: e.calendar_source_id,
              }))}
              onSelect={setSelected}
              onRangeChange={onRangeChange}
              emptyHint={t("noSyncedThisWeek")}
            />
            {selected && (
              <Card>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">{selected.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {selected.allDay
                        ? t("allDayOn", { day: selected.start.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }) })
                        : t("timeRangeOn", {
                            day: selected.start.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }),
                            start: selected.start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
                            end: selected.end.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
                          })}
                    </p>
                    {selected.label && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: selected.color }} />
                        {selected.label}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>{tc("close")}</Button>
                </CardContent>
              </Card>
            )}
          </>
        ) : cachedEvents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              {t("noCached")}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-2">
              <div className="divide-y">
                {cachedEvents.map((event) => {
                  const start = new Date(event.starts_at);
                  const end = new Date(event.ends_at);
                  return (
                    <div key={event.id} className="flex items-start justify-between py-3 gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {event.title || t("noTitle")}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-muted-foreground">
                            {start.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}
                          </span>
                          {event.is_all_day ? (
                            <Badge variant="secondary" className="text-xs">{t("allDay")}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {t("timeRange", { start: start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }), end: end.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}
                            </span>
                          )}
                        </div>
                      </div>
                      {event.source_name && (
                        <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                          {event.source_name}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("addCalendar")}</CardTitle>
            <div className="flex flex-wrap justify-end gap-2">
{googleEnabled && (
                            <Button size="sm" onClick={handleConnectGoogle} disabled={connectingGoogle}>
                <CalendarDays className="h-4 w-4 mr-2" />
                {connectingGoogle ? t("openingGoogle") : t("connectGoogle")}
              </Button>
              )}
              {outlookEnabled && (
                <Button size="sm" onClick={handleConnectOutlook} disabled={connectingOutlook}>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  {connectingOutlook ? t("openingOutlook") : t("connectOutlook")}
                </Button>
              )}
              {!showAddForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("addIcs")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showAddForm && (
            <form onSubmit={handleAddCalendar} className="space-y-4">
              <div>
                <Label htmlFor="name">{t("calendarName")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("calendarNamePlaceholder")}
                  required
                />
              </div>
              <div>
                <Label htmlFor="ics_url">{t("calendarLink")}</Label>
                <Input
                  id="ics_url"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  value={formData.ics_url}
                  onChange={(e) =>
                    setFormData({ ...formData, ics_url: e.target.value })
                  }
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={adding}>
                  {adding ? t("checkingLink") : t("addCalendar")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ name: "", ics_url: "" });
                  }}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <EmailSchedules onChange={fetchAll} />

      <CalendarSubscriptionCard />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("connected")}</h2>
        {calendars.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("noneConnected")}
            </CardContent>
          </Card>
        ) : (
          calendars.map((calendar) => (
            <Card key={calendar.id} id={`calendar-${calendar.id}`} className="scroll-mt-24">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold">{calendar.name}</h3>
                      <Badge variant="secondary">
                        {calendar.type === "microsoft" ? "Outlook" : calendar.type === "ics_url" ? "ICS" : calendar.type === "email" ? t("typeEmail") : calendar.type === "meetings" ? t("typeMeetings") : calendar.type.toUpperCase()}
                      </Badge>
                      {calendar.sync_status === "broken" && (
                        <Badge variant="destructive">{t("notSyncing")}</Badge>
                      )}
                      {calendar.sync_status === "failing" && (
                        <Badge variant="outline" className="border-amber-400 text-amber-800">{t("retrying")}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {calendar.last_synced_at
                        ? t("lastSynced", {
                            when: new Date(calendar.last_synced_at).toLocaleString(locale, {
                              month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                            }),
                          })
                        : t("neverSynced")}
                    </p>
                    {calendar.sync_status !== "ok" && calendar.last_sync_error && (
                      <p className="text-sm mt-2 flex items-start gap-2 text-red-700">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                          {calendar.last_sync_error}
                          {calendar.sync_status === "broken" &&
                            ` ${t("brokenNote")}`}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {calendar.type === "microsoft" && outlookEnabled && calendar.sync_status !== "ok" && (
                      <Button
                        size="sm"
                        variant={calendar.sync_status === "broken" ? "default" : "outline"}
                        onClick={handleConnectOutlook}
                        disabled={connectingOutlook}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("reconnect")}
                      </Button>
                    )}
                    {calendar.type === "google" && calendar.sync_status !== "ok" && (
                      <Button
                        size="sm"
                        variant={calendar.sync_status === "broken" ? "default" : "outline"}
                        onClick={handleConnectGoogle}
                        disabled={connectingGoogle}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("reconnect")}
                      </Button>
                    )}
                    {calendar.type === "ics_url" && (
                      <Button
                        size="sm"
                        variant={calendar.sync_status === "broken" ? "default" : "outline"}
                        onClick={() => {
                          setReplacing(replacing === calendar.id ? null : calendar.id);
                          setNewLink("");
                        }}
                        aria-label={t("replaceLink")}
                      >
                        <Link2 className="h-4 w-4" />
                        {calendar.sync_status === "broken" && <span className="ml-2">{t("replaceLink")}</span>}
                      </Button>
                    )}
                    {calendar.type !== "email" && calendar.type !== "meetings" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSync(calendar.id)}
                        aria-label={t("syncNow")}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(calendar.id)}
                      aria-label={t("removeCalendar")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {replacing === calendar.id && (
                  <form onSubmit={(e) => handleReplaceLink(e, calendar.id)} className="mt-4 flex gap-2">
                    <Input
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      placeholder={t("newLinkPlaceholder")}
                      required
                      autoFocus
                    />
                    <Button type="submit" disabled={savingLink}>
                      {savingLink ? t("checking") : tc("save")}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
