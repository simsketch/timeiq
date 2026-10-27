"use client";

import { useState } from "react";
import { NumberField, Panel, Result, money, num } from "./ui";

/** $X/hour at N hours a week, as yearly, monthly, weekly and daily pay (and back). */
export function HourlySalaryCalculator({ initialRate = 25, initialHours = 40 }: { initialRate?: number; initialHours?: number }) {
  const [mode, setMode] = useState<"hourly" | "salary">("hourly");
  const [rate, setRate] = useState(initialRate);
  const [salary, setSalary] = useState(60000);
  const [hours, setHours] = useState(initialHours);
  const [weeks, setWeeks] = useState(52);
  const [days, setDays] = useState(5);

  const hourly = mode === "hourly" ? rate : salary / Math.max(hours * weeks, 1);
  const yearly = hourly * hours * weeks;

  return (
    <Panel>
      <div className="mb-6 inline-flex rounded-lg border p-0.5" role="group" aria-label="Direction">
        {(["hourly", "salary"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            {m === "hourly" ? "Hourly → yearly" : "Yearly → hourly"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "hourly" ? (
          <NumberField label="Hourly rate" prefix="$" value={rate} onChange={setRate} step={0.5} />
        ) : (
          <NumberField label="Yearly salary" prefix="$" value={salary} onChange={setSalary} step={1000} />
        )}
        <NumberField label="Hours per week" suffix="hrs" value={hours} onChange={setHours} />
        <NumberField label="Weeks worked per year" suffix="weeks" value={weeks} onChange={setWeeks} hint="52 with paid time off, 50 if you take 2 unpaid weeks" />
        <NumberField label="Days worked per week" suffix="days" value={days} onChange={setDays} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {mode === "hourly" ? <Result big label="Per year" value={money(yearly)} /> : <Result big label="Per hour" value={money(hourly, 2)} />}
        <Result big label="Per month" value={money(yearly / 12)} />
        <Result label="Per week" value={money(hourly * hours)} />
        <Result label="Per day" value={money((hourly * hours) / Math.max(days, 1))} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {money(hourly, 2)}/hour × {num(hours)} hours × {num(weeks)} weeks = {money(yearly)} a year, before taxes.
      </p>
    </Panel>
  );
}
