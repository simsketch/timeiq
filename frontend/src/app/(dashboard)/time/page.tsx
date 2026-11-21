"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
} from "date-fns";
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ClockLoader } from "@/components/ui/clock-loader";
import { ImportDialog } from "@/components/time/import-dialog";
import { TaskCombobox } from "@/components/time/task-combobox";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Client,
  MoneyStats,
  TimeEntry,
  TimesheetRow,
  UnbilledSummary,
  authHeaders,
  fmtHours,
  fmtMoney,
} from "@/lib/invoicing";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const weekOf = (d: Date) => startOfWeek(d, { weekStartsOn: 0 });
const rowKey = (clientId: string, description: string) =>
  `${clientId}::${description.trim().toLowerCase()}`;

/** 4.5 -> "4h 30m", 2 -> "2h", 0 -> "" */
function fmtHm(hours: number): string {
  if (!hours) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Accepts "2", "2.5", "2h", "2h 30m", "30m", "1:30" */
function parseHours(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (hm && (hm[1] || hm[2])) {
    return (hm[1] ? parseFloat(hm[1]) : 0) + (hm[2] ? parseInt(hm[2]) / 60 : 0);
  }
  return null;
}

interface Row {
  key: string;
  client_id: string;
  client_name: string;
  description: string;
  saved_id?: string; // present when the row is persisted server-side
}

// A billed entry needs ?force=true, which also rewrites its invoice line.
const entryUrl = (e: TimeEntry) =>
  `/api/time-entries/${e.id}${e.invoice_id ? "?force=true" : ""}`;

// Hours on a draft stay editable and keep the draft in sync. Only invoices
// that have gone out (sent or paid) lock their hours behind a confirmation.
const isLocked = (e: TimeEntry) => !!e.invoice_id && e.invoice_status !== "draft";

const invoiceList = (entries: TimeEntry[]) =>
  Array.from(new Set(entries.map((e) => e.invoice_number).filter(Boolean))).join(", ");

type Pending =
  | {
      kind: "edit";
      row: Row;
      clientId: string;
      description: string;
      thisWeek: TimeEntry[];
      allWeeks: TimeEntry[];
      merges: boolean;
    }
  | { kind: "delete"; row: Row; billed: TimeEntry[]; all: TimeEntry[] }
  | { kind: "cell"; cellKey: string; entry: TimeEntry };

export default function TimePage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const t = useTranslations("time");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<UnbilledSummary[]>([]);
  // Billed cells the user has explicitly chosen to edit this session.
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => weekOf(new Date()));
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 0 }), [weekStart]);
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Saved rows persist across weeks (server-side); entry-derived rows fill in the rest.
  const [savedRows, setSavedRows] = useState<TimesheetRow[]>([]);
  const [target, setTarget] = useState<number>(40);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ client_id: "", description: "" });
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Inline row editing (client + task name)
  const [editRowKey, setEditRowKey] = useState<string | null>(null);
  const [rowEdit, setRowEdit] = useState({ client_id: "", description: "" });

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const token = await getToken();
        const headers = authHeaders(token);
        const [c, e, s, r, m] = await Promise.all([
          apiFetch<Client[]>("/api/clients", { headers }),
          apiFetch<TimeEntry[]>(
            `/api/time-entries?start=${iso(weekStart)}&end=${iso(weekEnd)}`,
            { headers }
          ),
          apiFetch<UnbilledSummary[]>("/api/time-entries/summary", { headers }),
          apiFetch<TimesheetRow[]>("/api/timesheet-rows", { headers }),
          apiFetch<MoneyStats>("/api/dashboard/money", { headers }).catch(() => null),
        ]);
        setClients(c);
        setEntries(e);
        setSummary(s);
        setSavedRows(r);
        if (m) setTarget(m.weekly_hours_target);
      } catch (e: any) {
        toast({ title: t("loadFailed"), description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [getToken, toast, weekStart, weekEnd, t]
  );

  useEffect(() => {
    // load() shows the spinner synchronously when the week changes, which is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Grid rows: saved rows first, then any client+task that has entries this week.
  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const r of savedRows) {
      const key = rowKey(r.client_id, r.description);
      map.set(key, { key, client_id: r.client_id, client_name: r.client_name, description: r.description, saved_id: r.id });
    }
    for (const e of entries) {
      const key = rowKey(e.client_id, e.description);
      if (!map.has(key)) {
        map.set(key, { key, client_id: e.client_id, client_name: e.client_name, description: e.description });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.client_name.localeCompare(b.client_name) ||
        a.description.localeCompare(b.description)
    );
  }, [entries, savedRows]);

  const cellEntries = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    for (const e of entries) {
      const k = `${rowKey(e.client_id, e.description)}|${e.entry_date}`;
      (m[k] ??= []).push(e);
    }
    return m;
  }, [entries]);

  const cellHours = (row: Row, day: Date) =>
    (cellEntries[`${row.key}|${iso(day)}`] ?? []).reduce((s, e) => s + parseFloat(e.hours), 0);
  const cellBilled = (row: Row, day: Date) =>
    (cellEntries[`${row.key}|${iso(day)}`] ?? []).find(isLocked) ?? null;

  const dayTotals = days.map((d) =>
    entries.filter((e) => e.entry_date === iso(d)).reduce((s, e) => s + parseFloat(e.hours), 0)
  );
  const weekTotal = dayTotals.reduce((s, h) => s + h, 0);

  async function commitCell(row: Row, day: Date, raw: string) {
    const hours = parseHours(raw);
    if (hours === null) {
      toast({ title: t("hoursFormat"), variant: "destructive" });
      return;
    }
    const existing = cellEntries[`${row.key}|${iso(day)}`] ?? [];
    const current = existing.reduce((s, e) => s + parseFloat(e.hours), 0);
    if (Math.abs(hours - current) < 0.001) return;
    const cellKey = `${row.key}|${iso(day)}`;
    if (existing.some(isLocked) && !unlocked.has(cellKey)) return;
    if (hours > 24) {
      toast({ title: t("hoursMax"), variant: "destructive" });
      return;
    }

    const cellId = `${row.key}|${iso(day)}`;
    setSavingCells((s) => new Set(s).add(cellId));
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      if (hours === 0) {
        await Promise.all(
          existing.map((e) => apiFetch(entryUrl(e), { method: "DELETE", headers }))
        );
      } else if (existing.length > 0) {
        // Fold the whole cell into the first entry.
        await apiFetch(entryUrl(existing[0]), {
          method: "PATCH",
          headers,
          body: JSON.stringify({ hours: hours.toFixed(2) }),
        });
        await Promise.all(
          existing.slice(1).map((e) => apiFetch(entryUrl(e), { method: "DELETE", headers }))
        );
      } else {
        await apiFetch("/api/time-entries", {
          method: "POST",
          headers,
          body: JSON.stringify({
            client_id: row.client_id,
            entry_date: iso(day),
            hours: hours.toFixed(2),
            description: row.description,
          }),
        });
      }
      await load(true);
    } catch (e: any) {
      toast({ title: t("saveFailed"), description: e.message, variant: "destructive" });
    } finally {
      setSavingCells((s) => {
        const n = new Set(s);
        n.delete(cellId);
        return n;
      });
    }
  }

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    const client = clients.find((c) => c.id === addForm.client_id);
    const description = addForm.description.trim();
    if (!client || !description) return;
    setBusy(true);
    try {
      const token = await getToken();
      const created = await apiFetch<TimesheetRow>("/api/timesheet-rows", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ client_id: client.id, description }),
      });
      setSavedRows((prev) => (prev.some((r) => r.id === created.id) ? prev : [...prev, created]));
      setAddForm({ client_id: addForm.client_id, description: "" });
      setAddOpen(false);
    } catch (err: any) {
      toast({ title: t("addRowFailed"), description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function startRowEdit(row: Row) {
    setEditRowKey(row.key);
    setRowEdit({ client_id: row.client_id, description: row.description });
  }

  async function saveRowEdit(row: Row) {
    const client = clients.find((c) => c.id === rowEdit.client_id);
    const description = rowEdit.description.trim();
    if (!client || !description) return;
    const changed = client.id !== row.client_id || description !== row.description;
    if (!changed) {
      setEditRowKey(null);
      return;
    }
    const newKey = rowKey(client.id, description);
    let merges = rows.some((r) => r.key === newKey && r.key !== row.key);
    const thisWeek = entries.filter((e) => rowKey(e.client_id, e.description) === row.key);

    // A task usually spans more than the week on screen, so look at all of it
    // before deciding what "rename" means.
    let allWeeks = thisWeek;
    setBusy(true);
    try {
      const token = await getToken();
      const every = await apiFetch<TimeEntry[]>(
        `/api/time-entries?client_id=${row.client_id}`,
        { headers: authHeaders(token) }
      );
      allWeeks = every.filter((e) => rowKey(e.client_id, e.description) === row.key);
      // The target name may already exist in a week that is not on screen.
      merges =
        merges || every.some((e) => rowKey(e.client_id, e.description) === newKey);
    } catch {
      // Fall back to the visible week rather than blocking the rename.
    } finally {
      setBusy(false);
    }

    const elsewhere = allWeeks.length - thisWeek.length;
    const billed = allWeeks.filter(isLocked).length;
    if (billed === 0 && elsewhere === 0 && !merges) {
      await applyRowEdit(row, client.id, description, thisWeek);
      return;
    }
    setPending({ kind: "edit", row, clientId: client.id, description, thisWeek, allWeeks, merges });
  }

  async function applyRowEdit(
    row: Row,
    clientId: string,
    description: string,
    targets: TimeEntry[]
  ) {
    if (targets.length === 0 && !row.saved_id) {
      toast({
        title: t("nothingToRename"),
        description: t("allInvoiced"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      await Promise.all(
        targets.map((e) =>
          apiFetch(entryUrl(e), {
            method: "PATCH",
            headers,
            body: JSON.stringify({ client_id: clientId, description }),
          })
        )
      );
      if (row.saved_id) {
        const updated = await apiFetch<TimesheetRow>(`/api/timesheet-rows/${row.saved_id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ client_id: clientId, description }),
        });
        setSavedRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      const touched = targets.filter(isLocked).length;
      if (touched > 0) {
        toast({
          title: t("updatedEntries", { count: targets.length }),
          description: t("rewrittenEntries", { count: touched, invoices: invoiceList(targets.filter(isLocked)) }),
        });
      }
      setPending(null);
      setEditRowKey(null);
      await load(true);
    } catch (e: any) {
      toast({ title: t("updateFailed"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(row: Row) {
    const rowEntries = entries.filter((e) => rowKey(e.client_id, e.description) === row.key);
    const unbilled = rowEntries.filter((e) => !isLocked(e));
    const billedEntries = rowEntries.filter(isLocked);
    if (billedEntries.length > 0) {
      setPending({ kind: "delete", row, billed: billedEntries, all: rowEntries });
      return;
    }
    const msg = unbilled.length
      ? t("confirmRemoveRow", { count: unbilled.length })
      : row.saved_id
      ? t("confirmRemoveTask", { task: row.description })
      : null;
    if (msg && !confirm(msg)) return;
    await applyRowDelete(row, unbilled);
  }

  async function applyRowDelete(row: Row, targets: TimeEntry[]) {
    if (targets.length === 0 && !row.saved_id) {
      toast({
        title: t("nothingToDelete"),
        description: t("allInvoiced"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      await Promise.all(
        targets.map((e) => apiFetch(entryUrl(e), { method: "DELETE", headers }))
      );
      setPending(null);
      if (row.saved_id) {
        await apiFetch(`/api/timesheet-rows/${row.saved_id}`, { method: "DELETE", headers });
        setSavedRows((prev) => prev.filter((r) => r.id !== row.saved_id));
      }
      await load(true);
    } catch (e: any) {
      toast({ title: t("deleteFailed"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function copyPreviousWeek() {
    setBusy(true);
    try {
      const token = await getToken();
      const prevStart = addWeeks(weekStart, -1);
      const prevEnd = addWeeks(weekEnd, -1);
      const prev = await apiFetch<TimeEntry[]>(
        `/api/time-entries?start=${iso(prevStart)}&end=${iso(prevEnd)}`,
        { headers: authHeaders(token) }
      );
      const seen = new Set(rows.map((r) => r.key));
      const added: TimesheetRow[] = [];
      for (const e of prev) {
        const key = rowKey(e.client_id, e.description);
        if (seen.has(key)) continue;
        seen.add(key);
        const created = await apiFetch<TimesheetRow>("/api/timesheet-rows", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ client_id: e.client_id, description: e.description }),
        });
        added.push(created);
      }
      setSavedRows((p) => [...p, ...added.filter((a) => !p.some((r) => r.id === a.id))]);
      toast({
        title: added.length ? t("copiedRows", { count: added.length }) : t("nothingToCopy"),
      });
    } catch (e: any) {
      toast({ title: t("copyFailed"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyPreviousWeek} disabled={busy || clients.length === 0}>
            <Copy className="h-4 w-4 mr-2" />
            {t("copyPreviousWeek")}
          </Button>
          <ImportDialog
            clients={clients}
            defaultStart={iso(weekStart)}
            defaultEnd={iso(weekEnd)}
            onImported={() => load(true)}
          />
        </div>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("noClients")}
          </CardContent>
        </Card>
      ) : (
        <>
          {summary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summary.map((s) => (
                <Badge key={s.client_id} variant="secondary" className="py-1.5 px-3 font-normal">
                  <span className="font-medium mr-1">{s.client_name}</span>
                  {t("unbilledBadge", { hours: fmtHours(s.unbilled_hours), amount: fmtMoney(s.unbilled_amount, s.currency, locale) })}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" aria-label={t("previousWeek")} onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWeekStart(weekOf(new Date()))}>
                {tc("today")}
              </Button>
              <Button size="icon" variant="ghost" aria-label={t("nextWeek")} onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 text-sm text-muted-foreground">
                {t.rich("showingWeek", {
                  range: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).formatRange(weekStart, weekEnd),
                  strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                })}
              </span>
            </div>
            <Button size="sm" onClick={() => { setAddForm((f) => ({ ...f, client_id: f.client_id || clients[0].id })); setAddOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t("addRow")}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[56rem]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                    <th className="text-left font-semibold px-4 py-3 w-[14rem]">{t("client")}</th>
                    <th className="text-left font-semibold px-2 py-3">{t("task")}</th>
                    {days.map((d) => {
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th
                          key={iso(d)}
                          className={cn(
                            "font-semibold px-1 py-2 text-center w-[6.25rem]",
                            weekend && "text-muted-foreground/60",
                            isToday(d) && "text-primary"
                          )}
                        >
                          <div>{d.toLocaleDateString(locale, { weekday: "long" })}</div>
                          <div className="font-normal normal-case">{d.toLocaleDateString(locale, { day: "2-digit", month: "short" })}</div>
                        </th>
                      );
                    })}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={days.length + 3} className="px-4 py-10 text-center text-muted-foreground">
                        {t("emptyRows")}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.key} className="group border-b border-border/60 last:border-0">
                      {editRowKey === row.key ? (
                        <>
                          <td className="px-3 py-1.5">
                            <Select value={rowEdit.client_id} onValueChange={(v) => setRowEdit({ ...rowEdit, client_id: v })}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder={t("client")} />
                              </SelectTrigger>
                              <SelectContent>
                                {clients.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                className="h-9"
                                value={rowEdit.description}
                                onChange={(e) => setRowEdit({ ...rowEdit, description: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveRowEdit(row);
                                  if (e.key === "Escape") setEditRowKey(null);
                                }}
                              />
                              <Button size="icon" variant="ghost" aria-label={t("saveRow")} disabled={busy} onClick={() => saveRowEdit(row)}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label={tc("cancel")} onClick={() => setEditRowKey(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-medium truncate max-w-[14rem]">
                            <button type="button" className="text-left hover:underline underline-offset-4" onClick={() => startRowEdit(row)}>
                              {row.client_name}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-muted-foreground truncate max-w-[18rem]">
                            <button type="button" className="inline-flex items-center gap-1.5 text-left hover:text-foreground" onClick={() => startRowEdit(row)}>
                              {row.description}
                              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                            </button>
                          </td>
                        </>
                      )}
                      {days.map((d) => (
                        <td key={iso(d)} className="px-1 py-1.5 text-center">
                          <HourCell
                            label={t("cellLabel", {
                              row: row.description ? `${row.client_name}, ${row.description}` : row.client_name,
                              date: d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }),
                            })}
                            value={cellHours(row, d)}
                            billed={cellBilled(row, d)}
                            unlocked={unlocked.has(`${row.key}|${iso(d)}`)}
                            weekend={d.getDay() === 0 || d.getDay() === 6}
                            saving={savingCells.has(`${row.key}|${iso(d)}`)}
                            onCommit={(raw) => commitCell(row, d, raw)}
                            onUnlock={() => {
                              const e = cellBilled(row, d);
                              if (e) setPending({ kind: "cell", cellKey: `${row.key}|${iso(d)}`, entry: e });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1.5 text-center">
                        <Button size="icon" variant="ghost" aria-label={t("removeRow")} disabled={busy} onClick={() => deleteRow(row)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="flex items-center gap-3">
                        <span>
                          {t("total", { hours: fmtHm(weekTotal) || "0h" })}
                          {target > 0 && <span className="text-muted-foreground font-normal"> / {target}h</span>}
                        </span>
                        {target > 0 && (
                          <span className="h-1.5 w-28 rounded-full bg-foreground/[0.08] overflow-hidden" aria-hidden>
                            <span
                              className="block h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--aurora-5)),hsl(var(--aurora-1)),hsl(var(--aurora-4)))]"
                              style={{ width: `${Math.min(100, (weekTotal / target) * 100)}%` }}
                            />
                          </span>
                        )}
                      </div>
                    </td>
                    {dayTotals.map((t, i) => (
                      <td key={i} className="px-1 py-3 text-center tabular-nums">
                        {fmtHm(t)}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={addRow}>
            <DialogHeader>
              <DialogTitle>{t("addRow")}</DialogTitle>
              <DialogDescription>{t("addRowDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("client")}</Label>
                <Select value={addForm.client_id} onValueChange={(v) => setAddForm({ ...addForm, client_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("client")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task">{t("task")}</Label>
                <TaskCombobox
                  id="task"
                  clientId={addForm.client_id}
                  value={addForm.description}
                  onChange={(description) => setAddForm({ ...addForm, description })}
                  taken={
                    new Set(
                      rows
                        .filter((r) => r.client_id === addForm.client_id)
                        .map((r) => r.description.trim().toLowerCase())
                    )
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!addForm.client_id || !addForm.description.trim()}>
                {tc("add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "delete"
                ? t("deleteBilledTitle")
                : pending?.kind === "cell"
                ? t("editBilledTitle")
                : t("renameTitle", { task: pending?.row.description ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "cell" ? (
                t("cellBilledBody", { invoice: pending.entry.invoice_number ?? "" })
              ) : pending?.kind === "edit" ? (
                <>
                  {t("renameCounts", {
                    count: pending.thisWeek.length,
                    others: pending.allWeeks.length - pending.thisWeek.length,
                  })}
                  {pending.allWeeks.some(isLocked) &&
                    ` ${t("renameBilled", { count: pending.allWeeks.filter(isLocked).length, invoices: invoiceList(pending.allWeeks) })}`}
                  {pending.merges && ` ${t("renameMerges")}`}
                </>
              ) : pending?.kind === "delete" ? (
                t("deleteBilledBody", { count: pending.billed.length, total: pending.all.length, invoices: invoiceList(pending.billed) })
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {(pending?.kind === "cell" ||
            (pending?.kind === "edit" && pending.allWeeks.some(isLocked)) ||
            (pending?.kind === "delete" && pending.billed.length > 0)) && (
            <p className="text-sm text-muted-foreground">
              {t("sentWarning")}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
              {tc("cancel")}
            </Button>
            {pending?.kind === "edit" &&
              pending.allWeeks.some((e) => !isLocked(e)) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    applyRowEdit(
                      pending.row,
                      pending.clientId,
                      pending.description,
                      pending.allWeeks.filter((e) => !isLocked(e))
                    )
                  }
                >
                  {t("unbilledOnly")}
                </Button>
              )}
            {pending?.kind === "edit" &&
              pending.thisWeek.length > 0 &&
              pending.allWeeks.length > pending.thisWeek.length && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    applyRowEdit(
                      pending.row,
                      pending.clientId,
                      pending.description,
                      pending.thisWeek
                    )
                  }
                >
                  {t("thisWeekOnly")}
                </Button>
              )}
            {pending?.kind === "delete" && pending.all.some((e) => !isLocked(e)) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  applyRowDelete(pending.row, pending.all.filter((e) => !isLocked(e)))
                }
              >
                {t("unbilledOnly")}
              </Button>
            )}
            <Button
              variant={pending?.kind === "delete" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => {
                if (!pending) return;
                if (pending.kind === "cell") {
                  setUnlocked((u) => new Set(u).add(pending.cellKey));
                  setPending(null);
                } else if (pending.kind === "edit") {
                  applyRowEdit(
                    pending.row,
                    pending.clientId,
                    pending.description,
                    pending.allWeeks
                  );
                } else {
                  applyRowDelete(pending.row, pending.all);
                }
              }}
            >
              {pending?.kind === "cell"
                ? t("editAnyway")
                : pending?.kind === "delete"
                ? t("deleteAll")
                : pending && pending.kind === "edit" && pending.allWeeks.length > pending.thisWeek.length
                ? t("renameAllWeeks")
                : t("renameAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HourCell({
  label,
  value,
  billed,
  unlocked,
  weekend,
  saving,
  onCommit,
  onUnlock,
}: {
  label: string;
  value: number;
  billed: TimeEntry | null;
  unlocked: boolean;
  weekend: boolean;
  saving: boolean;
  onCommit: (raw: string) => void;
  onUnlock: () => void;
}) {
  const t = useTranslations("time");
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const display = draft ?? fmtHm(value);

  if (billed && !unlocked) {
    return (
      <button
        type="button"
        onClick={onUnlock}
        aria-label={t("billedCellLabel", { label, hours: fmtHm(value), invoice: billed.invoice_number ?? "" })}
        title={t("billedCellTitle", { invoice: billed.invoice_number ?? "" })}
        className="h-9 w-full rounded-md border border-dashed bg-muted/50 text-muted-foreground flex items-center justify-center tabular-nums hover:border-foreground/40 hover:text-foreground transition-colors"
      >
        {fmtHm(value)}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      aria-label={label}
      value={display}
      inputMode="decimal"
      onFocus={(e) => {
        setDraft(value ? String(value) : "");
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") {
          setDraft(null);
          ref.current?.blur();
        }
      }}
      className={cn(
        "h-9 w-full rounded-md border bg-background text-center tabular-nums outline-none transition",
        "focus:ring-2 focus:ring-primary/40 focus:border-primary",
        weekend && !value && "bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,hsl(var(--muted))_4px,hsl(var(--muted))_5px)]",
        saving && "opacity-50"
      )}
    />
  );
}
