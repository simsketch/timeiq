"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { CalendarSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { apiFetch } from "@/lib/api";
import { Client, SuggestedEntry, authHeaders, fmtDate } from "@/lib/invoicing";

interface Props {
  clients: Client[];
  defaultStart: string;
  defaultEnd: string;
  onImported: () => void;
}

type Row = SuggestedEntry & { checked: boolean; description: string };

export function ImportDialog({ clients, defaultStart, defaultEnd, onImported }: Props) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const token = await getToken();
      const found = await apiFetch<SuggestedEntry[]>("/api/time-entries/suggest", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ client_id: clientId, start, end }),
      });
      setRows(found.map((s) => ({ ...s, checked: true, description: s.title })));
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function importChecked() {
    const picked = (rows ?? []).filter((r) => r.checked);
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const token = await getToken();
      await apiFetch("/api/time-entries/bulk", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          entries: picked.map((r) => ({
            client_id: clientId,
            entry_date: r.entry_date,
            hours: r.hours,
            description: r.description,
          })),
        }),
      });
      toast({ title: `Imported ${picked.length} entr${picked.length === 1 ? "y" : "ies"}` });
      setOpen(false);
      setRows(null);
      onImported();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev));
  }

  const client = clients.find((c) => c.id === clientId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setStart(defaultStart);
          setEnd(defaultEnd);
        } else {
          setRows(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={clients.length === 0}>
          <CalendarSearch className="h-4 w-4 mr-2" />
          Import from calendar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from calendar</DialogTitle>
          <DialogDescription>
            Finds synced calendar events whose title matches the client&apos;s keywords.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
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
            <Label>From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button onClick={search} disabled={busy || !clientId}>
            Search
          </Button>
        </div>
        {client && !client.match_keywords && (
          <p className="text-sm text-amber-600">
            This client has no calendar keywords. Add some on the Clients page first.
          </p>
        )}
        {rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No matching events that aren&apos;t already logged.
          </p>
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={`${r.external_id}-${r.starts_at}`}
                className="grid grid-cols-[auto_4rem_1fr_5rem] gap-2 items-center"
              >
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={(e) => update(i, { checked: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="text-sm">{fmtDate(r.entry_date, "MMM d")}</span>
                <Input value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
                <Input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={r.hours}
                  onChange={(e) => update(i, { hours: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={importChecked} disabled={busy || !rows || rows.every((r) => !r.checked)}>
            Import selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
