"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
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
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Client,
  TimeEntry,
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
}

export default function TimePage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<UnbilledSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => weekOf(new Date()));
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 0 }), [weekStart]);
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Rows added this session that have no entries yet, keyed by week.
  const [extraRows, setExtraRows] = useState<Record<string, Row[]>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ client_id: "", description: "" });
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const token = await getToken();
        const headers = authHeaders(token);
        const [c, e, s] = await Promise.all([
          apiFetch<Client[]>("/api/clients", { headers }),
          apiFetch<TimeEntry[]>(
            `/api/time-entries?start=${iso(weekStart)}&end=${iso(weekEnd)}`,
            { headers }
          ),
          apiFetch<UnbilledSummary[]>("/api/time-entries/summary", { headers }),
        ]);
        setClients(c);
        setEntries(e);
        setSummary(s);
      } catch (e: any) {
        toast({ title: "Failed to load", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [getToken, toast, weekStart, weekEnd]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Build grid rows from this week's entries plus any locally added rows.
  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const e of entries) {
      const key = rowKey(e.client_id, e.description);
      if (!map.has(key)) {
        map.set(key, {
          key,
          client_id: e.client_id,
          client_name: e.client_name,
          description: e.description,
        });
      }
    }
    for (const r of extraRows[iso(weekStart)] ?? []) {
      if (!map.has(r.key)) map.set(r.key, r);
    }
    return [...map.values()].sort(
      (a, b) =>
        a.client_name.localeCompare(b.client_name) ||
        a.description.localeCompare(b.description)
    );
  }, [entries, extraRows, weekStart]);

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
    (cellEntries[`${row.key}|${iso(day)}`] ?? []).find((e) => e.invoice_id) ?? null;

  const dayTotals = days.map((d) =>
    entries.filter((e) => e.entry_date === iso(d)).reduce((s, e) => s + parseFloat(e.hours), 0)
  );
  const weekTotal = dayTotals.reduce((s, h) => s + h, 0);

  async function commitCell(row: Row, day: Date, raw: string) {
    const hours = parseHours(raw);
    if (hours === null) {
      toast({ title: "Enter hours like 2, 2.5, or 2h 30m", variant: "destructive" });
      return;
    }
    const existing = cellEntries[`${row.key}|${iso(day)}`] ?? [];
    const current = existing.reduce((s, e) => s + parseFloat(e.hours), 0);
    if (Math.abs(hours - current) < 0.001) return;
    if (existing.some((e) => e.invoice_id)) return;
    if (hours > 24) {
      toast({ title: "Hours must be 24 or less", variant: "destructive" });
      return;
    }

    const cellId = `${row.key}|${iso(day)}`;
    setSavingCells((s) => new Set(s).add(cellId));
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      if (hours === 0) {
        await Promise.all(
          existing.map((e) => apiFetch(`/api/time-entries/${e.id}`, { method: "DELETE", headers }))
        );
      } else if (existing.length > 0) {
        // Fold the whole cell into the first entry.
        await apiFetch(`/api/time-entries/${existing[0].id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ hours: hours.toFixed(2) }),
        });
        await Promise.all(
          existing.slice(1).map((e) => apiFetch(`/api/time-entries/${e.id}`, { method: "DELETE", headers }))
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
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingCells((s) => {
        const n = new Set(s);
        n.delete(cellId);
        return n;
      });
    }
  }

  function addRow(e: React.FormEvent) {
    e.preventDefault();
    const client = clients.find((c) => c.id === addForm.client_id);
    const description = addForm.description.trim();
    if (!client || !description) return;
    const row: Row = {
      key: rowKey(client.id, description),
      client_id: client.id,
      client_name: client.name,
      description,
    };
    const wk = iso(weekStart);
    setExtraRows((prev) => ({ ...prev, [wk]: [...(prev[wk] ?? []), row] }));
    setAddForm({ client_id: addForm.client_id, description: "" });
    setAddOpen(false);
  }

  async function deleteRow(row: Row) {
    const rowEntries = entries.filter((e) => rowKey(e.client_id, e.description) === row.key);
    const unbilled = rowEntries.filter((e) => !e.invoice_id);
    if (rowEntries.length === 0) {
      const wk = iso(weekStart);
      setExtraRows((prev) => ({ ...prev, [wk]: (prev[wk] ?? []).filter((r) => r.key !== row.key) }));
      return;
    }
    if (!confirm(`Remove ${unbilled.length} unbilled entr${unbilled.length === 1 ? "y" : "ies"} for "${row.description}" this week?`)) return;
    setBusy(true);
    try {
      const token = await getToken();
      const headers = authHeaders(token);
      await Promise.all(
        unbilled.map((e) => apiFetch(`/api/time-entries/${e.id}`, { method: "DELETE", headers }))
      );
      await load(true);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
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
      const added: Row[] = [];
      for (const e of prev) {
        const key = rowKey(e.client_id, e.description);
        if (seen.has(key)) continue;
        seen.add(key);
        added.push({ key, client_id: e.client_id, client_name: e.client_name, description: e.description });
      }
      const wk = iso(weekStart);
      setExtraRows((p) => ({ ...p, [wk]: [...(p[wk] ?? []), ...added] }));
      toast({
        title: added.length
          ? `Copied ${added.length} row${added.length === 1 ? "" : "s"} from last week`
          : "Nothing new to copy from last week",
      });
    } catch (e: any) {
      toast({ title: "Copy failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading timesheet" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheet</h1>
          <p className="text-muted-foreground mt-2">
            Enter hours per day. Cells save when you leave them. Billed cells are locked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyPreviousWeek} disabled={busy || clients.length === 0}>
            <Copy className="h-4 w-4 mr-2" />
            Copy previous week
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
            Add a client first, then log time against it.
          </CardContent>
        </Card>
      ) : (
        <>
          {summary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summary.map((s) => (
                <Badge key={s.client_id} variant="secondary" className="py-1.5 px-3 font-normal">
                  <span className="font-medium mr-1">{s.client_name}</span>
                  unbilled {fmtHours(s.unbilled_hours)} · {fmtMoney(s.unbilled_amount, s.currency)}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" aria-label="Previous week" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWeekStart(weekOf(new Date()))}>
                Today
              </Button>
              <Button size="icon" variant="ghost" aria-label="Next week" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 text-sm text-muted-foreground">
                Showing time for{" "}
                <span className="font-medium text-foreground">
                  {format(weekStart, "d")} – {format(weekEnd, "d MMMM yyyy")}
                </span>
              </span>
            </div>
            <Button size="sm" onClick={() => { setAddForm((f) => ({ ...f, client_id: f.client_id || clients[0].id })); setAddOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add row
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[56rem]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                    <th className="text-left font-semibold px-4 py-3 w-[14rem]">Client</th>
                    <th className="text-left font-semibold px-2 py-3">Task</th>
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
                          <div>{format(d, "EEEE")}</div>
                          <div className="font-normal normal-case">{format(d, "dd MMM")}</div>
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
                        No rows this week. Add a row or copy last week to get started.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium truncate max-w-[14rem]">{row.client_name}</td>
                      <td className="px-2 py-2 text-muted-foreground truncate max-w-[18rem]">{row.description}</td>
                      {days.map((d) => (
                        <td key={iso(d)} className="px-1 py-1.5 text-center">
                          <HourCell
                            value={cellHours(row, d)}
                            billed={cellBilled(row, d)}
                            weekend={d.getDay() === 0 || d.getDay() === 6}
                            saving={savingCells.has(`${row.key}|${iso(d)}`)}
                            onCommit={(raw) => commitCell(row, d, raw)}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1.5 text-center">
                        <Button size="icon" variant="ghost" aria-label="Remove row" disabled={busy} onClick={() => deleteRow(row)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>
                      Timesheet total: {fmtHm(weekTotal) || "0h"}
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
              <DialogTitle>Add row</DialogTitle>
              <DialogDescription>A row is a client plus a task. Hours go in the day cells.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={addForm.client_id} onValueChange={(v) => setAddForm({ ...addForm, client_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Client" />
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
                <Label htmlFor="task">Task</Label>
                <Input
                  id="task"
                  autoFocus
                  required
                  placeholder="Platform support"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!addForm.client_id || !addForm.description.trim()}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HourCell({
  value,
  billed,
  weekend,
  saving,
  onCommit,
}: {
  value: number;
  billed: TimeEntry | null;
  weekend: boolean;
  saving: boolean;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const display = draft ?? fmtHm(value);

  if (billed) {
    return (
      <div
        title={`Billed on ${billed.invoice_number}`}
        className="h-9 w-full rounded-md border border-dashed bg-muted/50 text-muted-foreground flex items-center justify-center tabular-nums cursor-not-allowed"
      >
        {fmtHm(value)}
      </div>
    );
  }

  return (
    <input
      ref={ref}
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
