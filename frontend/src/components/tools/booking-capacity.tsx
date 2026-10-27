"use client";

import { useState } from "react";
import { InputProblem, NumberField, Panel, Result, firstProblem, money, num } from "./ui";

/** How many meetings fit in a week, with buffers, and what paid sessions add up to. */
export function BookingCapacityCalculator() {
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [days, setDays] = useState(5);
  const [length, setLength] = useState(30);
  const [buffer, setBuffer] = useState(10);
  const [busyPct, setBusyPct] = useState(40);
  const [price, setPrice] = useState(0);
  const [cap, setCap] = useState(0);

  const problem = firstProblem([
    [hoursPerDay >= 0 && hoursPerDay <= 24, "Bookable hours per day must be between 0 and 24."],
    [days >= 0 && days <= 7, "Bookable days per week must be between 0 and 7."],
    [length > 0, "Meeting length must be more than 0 minutes."],
    [buffer >= 0, "Buffer between meetings can't be negative."],
    [busyPct >= 0 && busyPct <= 100, "Already busy must be between 0% and 100%."],
    [cap >= 0 && price >= 0, "Booking cap and price can't be negative."],
  ]);
  const show = (v: string) => (problem ? "—" : v);

  const open = hoursPerDay * 60 * (1 - busyPct / 100);
  const perDayRaw = Math.floor((open + buffer) / Math.max(length + buffer, 1));
  const perDay = cap > 0 ? Math.min(perDayRaw, cap) : perDayRaw;
  const perWeek = perDay * days;

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Bookable hours per day" suffix="hrs" max={24} value={hoursPerDay} onChange={setHoursPerDay} step={0.5} />
        <NumberField label="Bookable days per week" suffix="days" max={7} value={days} onChange={setDays} />
        <NumberField label="Meeting length" suffix="min" value={length} onChange={setLength} step={5} />
        <NumberField label="Buffer between meetings" suffix="min" value={buffer} onChange={setBuffer} step={5} />
        <NumberField label="Already busy" suffix="% of those hours" max={100} value={busyPct} onChange={setBusyPct} hint="Other meetings, school runs, focus time on your other calendars" />
        <NumberField label="Daily booking cap" suffix="per day" value={cap} onChange={setCap} hint="0 for no cap" />
        <NumberField label="Price per session (optional)" prefix="$" value={price} onChange={setPrice} step={5} />
      </div>
      <InputProblem message={problem} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label="Meetings per week" value={show(num(perWeek))} />
        <Result big label="Meetings per day" value={show(num(perDay))} />
        <Result label="Hours in meetings per week" value={show(num((perWeek * length) / 60, 1))} />
        <Result label={price > 0 ? "Revenue per month at capacity" : "Meetings per month"} value={show(price > 0 ? money(perWeek * price * 4.33) : num(perWeek * 4.33))} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        The &ldquo;already busy&rdquo; share is the one people underestimate. If your other calendars aren&apos;t connected to your booking page, those hours look free to whoever books.
      </p>
    </Panel>
  );
}
