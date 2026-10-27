"use client";

import { useState } from "react";
import { InputProblem, NumberField, Panel, Result, firstProblem, money, num } from "./ui";

/** The hourly rate a freelancer needs to hit a take-home target. */
export function FreelanceRateCalculator() {
  const [income, setIncome] = useState(90000);
  const [expenses, setExpenses] = useState(8000);
  const [taxPct, setTaxPct] = useState(25);
  const [hours, setHours] = useState(40);
  const [billablePct, setBillablePct] = useState(65);
  const [weeksOff, setWeeksOff] = useState(4);

  const problem = firstProblem([
    [income >= 0 && expenses >= 0, "Income and expenses can't be negative."],
    [taxPct >= 0 && taxPct < 100, "Taxes must be at least 0% and under 100% of revenue."],
    [hours > 0 && hours <= 168, "Hours per week must be more than 0 and at most 168."],
    [billablePct > 0 && billablePct <= 100, "Billable share must be more than 0% and at most 100%. With no billable hours, no rate covers your costs."],
    [weeksOff >= 0 && weeksOff < 52, "Weeks off must be at least 0 and under 52."],
  ]);
  const show = (v: string) => (problem ? "—" : v);

  const workWeeks = 52 - weeksOff;
  const billableHours = hours * (billablePct / 100) * workWeeks;
  const gross = (income + expenses) / (1 - taxPct / 100);
  const rate = gross / billableHours;

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Take-home income you want" prefix="$" value={income} onChange={setIncome} step={1000} />
        <NumberField label="Business expenses per year" prefix="$" value={expenses} onChange={setExpenses} step={500} hint="Software, insurance, equipment, health care" />
        <NumberField label="Taxes" suffix="% of revenue" value={taxPct} onChange={setTaxPct} />
        <NumberField label="Hours you work per week" suffix="hrs" max={168} value={hours} onChange={setHours} />
        <NumberField label="Share of those hours you can bill" suffix="%" max={100} value={billablePct} onChange={setBillablePct} hint="Sales, admin and email are unbilled. 60–70% is typical." />
        <NumberField label="Weeks off per year" suffix="weeks" value={weeksOff} onChange={setWeeksOff} hint="Vacation, holidays, sick days" />
      </div>
      <InputProblem message={problem} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label="Minimum hourly rate" value={show(money(rate))} />
        <Result big label="Revenue you need" value={show(money(gross))} />
        <Result label="Billable hours per year" value={show(num(billableHours))} />
        <Result label="Day rate (8 billable hours)" value={show(money(rate * 8))} />
      </div>
    </Panel>
  );
}
