"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  parseISO,
  startOfWeek,
} from "date-fns";
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Client,
  TimeEntry,
  UnbilledSummary,
  authHeaders,
  fmtHours,
  fmtMoney,
} from "@/lib/invoicing";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const weekOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

export default function TimePage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<UnbilledSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => weekOf(new Date()));
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);

  const [form, setForm] = useState({
    entry_date: iso(new Date()),
    client_id: "",
    hours: "",
    description: "",
  });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ hours: "", description: "" });

  const load = useCallback(async () => {
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
      setForm((f) => (f.client_id || c.length === 0 ? f : { ...f, client_id: c[0].id }));
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast, weekStart, weekEnd]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const token = await getToken();
      await apiFetch("/api/time-entries", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(form),
      });
      setForm((f) => ({ ...f, hours: "", description: "" }));
      const d = parseISO(form.entry_date);
      if (d < weekStart || d > weekEnd) setWeekStart(weekOf(d));
      else load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id: string) {
    try {
      const token = await getToken();
      await apiFetch(`/api/time-entries/${id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify(edit),
      });
      setEditId(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function remove(entry: TimeEntry) {
    if (!confirm("Delete this entry?")) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/time-entries/${entry.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const byDay = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    for (const e of entries) (m[e.entry_date] ??= []).push(e);
    return m;
  }, [entries]);
  const weekHours = entries.reduce((s, e) => s + parseFloat(e.hours), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading time" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time</h1>
          <p className="text-muted-foreground mt-2">
            Log your hours each day. Billed entries lock once invoiced.
          </p>
        </div>
        <ImportDialog
          clients={clients}
          defaultStart={iso(weekStart)}
          defaultEnd={iso(weekEnd)}
          onImported={load}
        />
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add a client first, then log time against it.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-4">
              <form
                onSubmit={add}
                className="grid gap-3 sm:grid-cols-[9.5rem_12rem_6rem_1fr_auto] items-center"
              >
                <Input
                  type="date"
                  required
                  value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                />
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
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
                <Input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  required
                  placeholder="Hours"
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                />
                <Input
                  required
                  placeholder="What did you work on?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <Button type="submit" disabled={adding || !form.client_id}>
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

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
              <Button
                size="icon"
                variant="ghost"
                aria-label="Previous week"
                onClick={() => setWeekStart(addWeeks(weekStart, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWeekStart(weekOf(new Date()))}>
                Today
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Next week"
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 font-medium">
                {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">{fmtHours(weekHours)} this week</span>
          </div>

          <div className="space-y-3">
            {days.map((day) => {
              const key = iso(day);
              const list = byDay[key] ?? [];
              const total = list.reduce((s, e) => s + parseFloat(e.hours), 0);
              return (
                <Card key={key} className={isToday(day) ? "ring-1 ring-primary/40" : ""}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">{format(day, "EEEE, MMM d")}</h3>
                      <span className="text-sm text-muted-foreground">
                        {total > 0 ? fmtHours(total) : "—"}
                      </span>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground/70">No entries</p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {list.map((e) => (
                          <li
                            key={e.id}
                            className={`py-2 flex items-center gap-3 ${e.invoice_id ? "opacity-60" : ""}`}
                          >
                            {editId === e.id ? (
                              <>
                                <Input
                                  className="w-24"
                                  type="number"
                                  step="0.25"
                                  min="0.25"
                                  max="24"
                                  value={edit.hours}
                                  onChange={(ev) => setEdit({ ...edit, hours: ev.target.value })}
                                />
                                <Input
                                  className="flex-1"
                                  value={edit.description}
                                  onChange={(ev) => setEdit({ ...edit, description: ev.target.value })}
                                />
                                <Button size="icon" variant="ghost" aria-label="Save" onClick={() => saveEdit(e.id)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditId(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="w-16 text-sm font-medium tabular-nums">{fmtHours(e.hours)}</span>
                                <span className="flex-1 text-sm min-w-0">
                                  <span className="text-muted-foreground mr-2">{e.client_name}</span>
                                  {e.description}
                                </span>
                                {e.invoice_number ? (
                                  <Badge variant="outline">{e.invoice_number}</Badge>
                                ) : (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label="Edit"
                                      onClick={() => {
                                        setEditId(e.id);
                                        setEdit({ hours: e.hours, description: e.description });
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(e)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
