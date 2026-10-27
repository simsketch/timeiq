"use client";

import { useState } from "react";
import { InputProblem, NumberField, Panel, Result, firstProblem, money, num } from "./ui";

/** $X/hour at N hours a week, as yearly, monthly, weekly and daily pay (and back). */
export function HourlySalaryCalculator({ initialRate = 25, initialHours = 40 }: { initialRate?: number; initialHours?: number }) {
  const [mode, setMode] = useState<"hourly" | "salary">("hourly");
  const [rate, setRate] = useState(initialRate);
  const [salary, setSalary] = useState(60000);
  const [hours, setHours] = useState(initialHours);
  const [weeks, setWeeks] = useState(52);
  const [days, setDays] = useState(5);

  const problem = firstProblem([
    [mode === "hourly" ? rate >= 0 : salary >= 0, mode === "hourly" ? "Hourly rate can't be negative." : "Yearly salary can't be negative."],
    [hours > 0 && hours <= 168, "Hours per week must be more than 0 and at most 168."],
    [weeks > 0 && weeks <= 52, "Weeks worked per year must be more than 0 and at most 52."],
    [days > 0 && days <= 7, "Days worked per week must be more than 0 and at most 7."],
  ]);
  const show = (v: string) => (problem ? "—" : v);

  const hourly = mode === "hourly" ? rate : salary / (hours * weeks);
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
        <NumberField label="Hours per week" suffix="hrs" max={168} value={hours} onChange={setHours} />
        <NumberField label="Weeks worked per year" suffix="weeks" max={52} value={weeks} onChange={setWeeks} hint="52 with paid time off, 50 if you take 2 unpaid weeks" />
        <NumberField label="Days worked per week" suffix="days" max={7} value={days} onChange={setDays} />
      </div>
      <InputProblem message={problem} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {mode === "hourly" ? <Result big label="Per year" value={show(money(yearly))} /> : <Result big label="Per hour" value={show(money(hourly, 2))} />}
        <Result big label="Per month" value={show(money(yearly / 12))} />
        <Result label="Per week" value={show(money(hourly * hours))} />
        <Result label="Per day" value={show(money((hourly * hours) / days))} />
      </div>
      {!problem && (
        <p className="mt-4 text-sm text-muted-foreground">
          {money(hourly, 2)}/hour × {num(hours)} hours × {num(weeks)} weeks = {money(yearly)} a year, before taxes.
        </p>
      )}
    </Panel>
  );
}
