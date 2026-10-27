"use client";

import { useState } from "react";
import { NumberField, Panel, Result, money, num } from "./ui";

/** The hourly rate a freelancer needs to hit a take-home target. */
export function FreelanceRateCalculator() {
  const [income, setIncome] = useState(90000);
  const [expenses, setExpenses] = useState(8000);
  const [taxPct, setTaxPct] = useState(25);
  const [hours, setHours] = useState(40);
  const [billablePct, setBillablePct] = useState(65);
  const [weeksOff, setWeeksOff] = useState(4);

  const workWeeks = Math.max(52 - weeksOff, 1);
  const billableHours = hours * (billablePct / 100) * workWeeks;
  const gross = (income + expenses) / Math.max(1 - taxPct / 100, 0.01);
  const rate = gross / Math.max(billableHours, 1);

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Take-home income you want" prefix="$" value={income} onChange={setIncome} step={1000} />
        <NumberField label="Business expenses per year" prefix="$" value={expenses} onChange={setExpenses} step={500} hint="Software, insurance, equipment, health care" />
        <NumberField label="Taxes" suffix="% of revenue" value={taxPct} onChange={setTaxPct} />
        <NumberField label="Hours you work per week" suffix="hrs" value={hours} onChange={setHours} />
        <NumberField label="Share of those hours you can bill" suffix="%" value={billablePct} onChange={setBillablePct} hint="Sales, admin and email are unbilled. 60–70% is typical." />
        <NumberField label="Weeks off per year" suffix="weeks" value={weeksOff} onChange={setWeeksOff} hint="Vacation, holidays, sick days" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label="Minimum hourly rate" value={money(rate)} />
        <Result big label="Revenue you need" value={money(gross)} />
        <Result label="Billable hours per year" value={num(billableHours)} />
        <Result label="Day rate (8 billable hours)" value={money(rate * 8)} />
      </div>
    </Panel>
  );
}
