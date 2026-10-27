"use client";

import { useState } from "react";
import { NumberField, Panel, Result, money, num } from "./ui";

/** How many meetings fit in a week, with buffers, and what paid sessions add up to. */
export function BookingCapacityCalculator() {
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [days, setDays] = useState(5);
  const [length, setLength] = useState(30);
  const [buffer, setBuffer] = useState(10);
  const [busyPct, setBusyPct] = useState(40);
  const [price, setPrice] = useState(0);
  const [cap, setCap] = useState(0);

  const open = hoursPerDay * 60 * (1 - busyPct / 100);
  const perDayRaw = Math.floor((open + buffer) / Math.max(length + buffer, 1));
  const perDay = cap > 0 ? Math.min(perDayRaw, cap) : perDayRaw;
  const perWeek = perDay * days;

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Bookable hours per day" suffix="hrs" value={hoursPerDay} onChange={setHoursPerDay} step={0.5} />
        <NumberField label="Bookable days per week" suffix="days" value={days} onChange={setDays} />
        <NumberField label="Meeting length" suffix="min" value={length} onChange={setLength} step={5} />
        <NumberField label="Buffer between meetings" suffix="min" value={buffer} onChange={setBuffer} step={5} />
        <NumberField label="Already busy" suffix="% of those hours" value={busyPct} onChange={setBusyPct} hint="Other meetings, school runs, focus time on your other calendars" />
        <NumberField label="Daily booking cap" suffix="per day" value={cap} onChange={setCap} hint="0 for no cap" />
        <NumberField label="Price per session (optional)" prefix="$" value={price} onChange={setPrice} step={5} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label="Meetings per week" value={num(perWeek)} />
        <Result big label="Meetings per day" value={num(perDay)} />
        <Result label="Hours in meetings per week" value={num((perWeek * length) / 60, 1)} />
        <Result label={price > 0 ? "Revenue per month at capacity" : "Meetings per month"} value={price > 0 ? money(perWeek * price * 4.33) : num(perWeek * 4.33)} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        The &ldquo;already busy&rdquo; share is the one people underestimate. If your other calendars aren&apos;t connected to your booking page, those hours look free to whoever books.
      </p>
    </Panel>
  );
}
