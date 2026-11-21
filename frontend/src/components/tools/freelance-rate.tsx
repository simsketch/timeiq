"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { InputProblem, NumberField, Panel, Result, firstProblem, useNumbers } from "./ui";

/** The hourly rate a freelancer needs to hit a take-home target. */
export function FreelanceRateCalculator() {
  const t = useTranslations("tools.freelance");
  const u = useTranslations("tools.units");
  const { money, num } = useNumbers();
  const [income, setIncome] = useState(90000);
  const [expenses, setExpenses] = useState(8000);
  const [taxPct, setTaxPct] = useState(25);
  const [hours, setHours] = useState(40);
  const [billablePct, setBillablePct] = useState(65);
  const [weeksOff, setWeeksOff] = useState(4);

  const problem = firstProblem([
    [income >= 0 && expenses >= 0, t("errMoney")],
    [taxPct >= 0 && taxPct < 100, t("errTax")],
    [hours > 0 && hours <= 168, t("errHours")],
    [billablePct > 0 && billablePct <= 100, t("errBillable")],
    [weeksOff >= 0 && weeksOff < 52, t("errWeeks")],
  ]);
  const show = (v: string) => (problem ? "—" : v);

  const workWeeks = 52 - weeksOff;
  const billableHours = hours * (billablePct / 100) * workWeeks;
  const gross = (income + expenses) / (1 - taxPct / 100);
  const rate = gross / billableHours;

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label={t("income")} prefix="$" value={income} onChange={setIncome} step={1000} />
        <NumberField label={t("expenses")} prefix="$" value={expenses} onChange={setExpenses} step={500} hint={t("expensesHint")} />
        <NumberField label={t("taxes")} suffix={u("percentOfRevenue")} value={taxPct} onChange={setTaxPct} />
        <NumberField label={t("hours")} suffix={u("hrs")} max={168} value={hours} onChange={setHours} />
        <NumberField label={t("billable")} suffix="%" max={100} value={billablePct} onChange={setBillablePct} hint={t("billableHint")} />
        <NumberField label={t("weeksOff")} suffix={u("weeks")} value={weeksOff} onChange={setWeeksOff} hint={t("weeksOffHint")} />
      </div>
      <InputProblem message={problem} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label={t("rate")} value={show(money(rate))} />
        <Result big label={t("revenue")} value={show(money(gross))} />
        <Result label={t("billableHours")} value={show(num(billableHours))} />
        <Result label={t("dayRate")} value={show(money(rate * 8))} />
      </div>
    </Panel>
  );
}
