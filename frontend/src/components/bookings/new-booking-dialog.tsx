"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { addMinutes, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { calendarDate, calendarInstant } from "@/lib/calendar-time";

interface EventTypeOption {
  id: string;
  name: string;
  duration: number;
  location: string | null;
  is_active: boolean;
}

/** The next half hour from now, as a default start. */
export function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

export function NewBookingDialog({
  open,
  onOpenChange,
  start,
  zone,
  duration: draggedDuration,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: Date;
  /** The zone the date and time fields are in; the browser's when omitted. */
  zone?: string;
  /** Length in minutes, e.g. from dragging on the calendar; the event type's when omitted. */
  duration?: number;
  onCreated: () => void;
}) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [eventTypes, setEventTypes] = useState<EventTypeOption[] | null>(null);
  const [eventTypeId, setEventTypeId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState("");
  const [length, setLength] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const fieldZone = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Each opening starts from the slot that was clicked.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    const wall = calendarDate(start, fieldZone);
    setDate(format(wall, "yyyy-MM-dd"));
    setTime(format(wall, "HH:mm"));
    setName("");
    setEmail("");
    setNotes("");
    setGuests("");
    setLength(draggedDuration ? String(draggedDuration) : "");
    setConflict(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, start, fieldZone, draggedDuration]);

  useEffect(() => {
    if (!open || eventTypes) return;
    (async () => {
      try {
        const token = await getToken();
        const all = await apiFetch<EventTypeOption[]>("/api/event-types", { headers: { Authorization: `Bearer ${token}` } });
        const list = [...all].sort((a, b) => Number(b.is_active) - Number(a.is_active));
        setEventTypes(list);
        if (list.length) setEventTypeId(String(list[0].id));
      } catch {
        setEventTypes([]);
      }
    })();
  }, [open, eventTypes, getToken]);

  const eventType = eventTypes?.find((t) => String(t.id) === eventTypeId);
  const wallStart = date && time ? new Date(`${date}T${time}`) : null;
  const startsAt = wallStart && calendarInstant(wallStart, fieldZone);
  // Blank means the event type's length.
  const minutes = Number(length) || eventType?.duration || 30;
  const guestList = guests.split(/[\s,;]+/).map((g) => g.trim()).filter(Boolean);

  async function submit(allowConflict: boolean) {
    if (!startsAt || !eventType) return;
    const badGuest = guestList.find((g) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g));
    if (badGuest) {
      toast({ title: "Check the guest list", description: `${badGuest} isn't an email address.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      await apiFetch("/api/bookings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          event_type_id: eventType.id,
          visitor_name: name.trim(),
          visitor_email: email.trim(),
          visitor_notes: notes.trim() || null,
          guest_emails: guestList,
          duration_minutes: length ? minutes : null,
          starts_at: startsAt.toISOString(),
          timezone: fieldZone,
          allow_conflict: allowConflict,
        }),
      });
      toast({ title: "Booked", description: `Invite sent to ${[email.trim(), ...guestList].join(", ")}` });
      onOpenChange(false);
      onCreated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The booking didn't save. Try again.";
      if (message.startsWith("This time overlaps")) setConflict(message);
      else toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>Your guest gets a confirmation email with a calendar invite.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {eventTypes && eventTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Create an event type first. It sets the meeting length and location.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Event type</Label>
                <Select value={eventTypeId} onValueChange={setEventTypeId}>
                  <SelectTrigger aria-label="Event type">
                    <SelectValue placeholder={eventTypes ? "Event type" : "Loading…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} · {t.duration} min{t.is_active ? "" : " (hidden)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eventType && (
                  <p className="text-xs text-muted-foreground">
                    {eventType.location ? `Where: ${eventType.location}` : "No location or meeting link set on this event type."}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-3">
              <div className="space-y-2">
                <Label htmlFor="nb-date">Date</Label>
                <Input id="nb-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setConflict(null); }} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nb-time">Time</Label>
                <Input id="nb-time" type="time" step={300} value={time} onChange={(e) => { setTime(e.target.value); setConflict(null); }} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nb-length">Minutes</Label>
                <Input
                  id="nb-length"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={1440}
                  step={5}
                  placeholder={eventType ? String(eventType.duration) : "30"}
                  value={length}
                  onChange={(e) => { setLength(e.target.value); setConflict(null); }}
                />
              </div>
            </div>
            {wallStart && eventType && (
              <p className="-mt-2 text-xs text-muted-foreground">
                {format(wallStart, "EEE, MMM d · h:mm a")} – {format(addMinutes(wallStart, minutes), "h:mm a")} · {fieldZone.replace(/_/g, " ")}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="nb-name">Guest name</Label>
              <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-email">Guest email</Label>
              <Input id="nb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-guests">Other guests (optional)</Label>
              <Input
                id="nb-guests"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                placeholder="bea@example.com, cy@example.com"
                aria-describedby="nb-guests-hint"
              />
              <p id="nb-guests-hint" className="text-xs text-muted-foreground">They&apos;re on the invite and copied on the confirmation.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-notes">Note (optional)</Label>
              <Textarea id="nb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {conflict && (
              <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                {conflict}
              </p>
            )}
          </div>
          <DialogFooter>
            {conflict ? (
              <Button type="button" disabled={saving} onClick={() => submit(true)}>
                {saving ? "Booking…" : "Book anyway"}
              </Button>
            ) : (
              <Button type="submit" disabled={saving || !eventType}>
                {saving ? "Booking…" : "Book and send invite"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
