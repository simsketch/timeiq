"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { InputProblem, NumberField, Panel, Result, firstProblem, useNumbers } from "./ui";

/** $X/hour at N hours a week, as yearly, monthly, weekly and daily pay (and back). */
export function HourlySalaryCalculator({ initialRate = 25, initialHours = 40 }: { initialRate?: number; initialHours?: number }) {
  const t = useTranslations("tools.salary");
  const u = useTranslations("tools.units");
  const { money, num } = useNumbers();
  const [mode, setMode] = useState<"hourly" | "salary">("hourly");
  const [rate, setRate] = useState(initialRate);
  const [salary, setSalary] = useState(60000);
  const [hours, setHours] = useState(initialHours);
  const [weeks, setWeeks] = useState(52);
  const [days, setDays] = useState(5);

  const problem = firstProblem([
    [mode === "hourly" ? rate >= 0 : salary >= 0, mode === "hourly" ? t("errRate") : t("errSalary")],
    [hours > 0 && hours <= 168, t("errHours")],
    [weeks > 0 && weeks <= 52, t("errWeeks")],
    [days > 0 && days <= 7, t("errDays")],
  ]);
  const show = (v: string) => (problem ? "—" : v);

  const hourly = mode === "hourly" ? rate : salary / (hours * weeks);
  const yearly = hourly * hours * weeks;

  return (
    <Panel>
      <div className="mb-6 inline-flex rounded-lg border p-0.5" role="group" aria-label={t("direction")}>
        {(["hourly", "salary"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            {m === "hourly" ? t("hourlyToYearly") : t("yearlyToHourly")}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "hourly" ? (
          <NumberField label={t("rate")} prefix="$" value={rate} onChange={setRate} step={0.5} />
        ) : (
          <NumberField label={t("salary")} prefix="$" value={salary} onChange={setSalary} step={1000} />
        )}
        <NumberField label={t("hours")} suffix={u("hrs")} max={168} value={hours} onChange={setHours} />
        <NumberField label={t("weeks")} suffix={u("weeks")} max={52} value={weeks} onChange={setWeeks} hint={t("weeksHint")} />
        <NumberField label={t("days")} suffix={u("days")} max={7} value={days} onChange={setDays} />
      </div>
      <InputProblem message={problem} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {mode === "hourly" ? <Result big label={t("perYear")} value={show(money(yearly))} /> : <Result big label={t("perHour")} value={show(money(hourly, 2))} />}
        <Result big label={t("perMonth")} value={show(money(yearly / 12))} />
        <Result label={t("perWeek")} value={show(money(hourly * hours))} />
        <Result label={t("perDay")} value={show(money((hourly * hours) / days))} />
      </div>
      {!problem && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("summary", { rate: money(hourly, 2), hours: num(hours), weeks: num(weeks), yearly: money(yearly) })}
        </p>
      )}
    </Panel>
  );
}
