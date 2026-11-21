"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { InputProblem, NumberField, Panel, Result, firstProblem, useNumbers } from "./ui";

/** How many meetings fit in a week, with buffers, and what paid sessions add up to. */
export function BookingCapacityCalculator() {
  const t = useTranslations("tools.capacity");
  const u = useTranslations("tools.units");
  const { money, num } = useNumbers();
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [days, setDays] = useState(5);
  const [length, setLength] = useState(30);
  const [buffer, setBuffer] = useState(10);
  const [busyPct, setBusyPct] = useState(40);
  const [price, setPrice] = useState(0);
  const [cap, setCap] = useState(0);

  const problem = firstProblem([
    [hoursPerDay >= 0 && hoursPerDay <= 24, t("errHours")],
    [days >= 0 && days <= 7, t("errDays")],
    [length > 0, t("errLength")],
    [buffer >= 0, t("errBuffer")],
    [busyPct >= 0 && busyPct <= 100, t("errBusy")],
    [cap >= 0 && price >= 0, t("errCapPrice")],
  ]);
  const show = (v: string) => (problem ? "—" : v);

  const open = hoursPerDay * 60 * (1 - busyPct / 100);
  const perDayRaw = Math.floor((open + buffer) / Math.max(length + buffer, 1));
  const perDay = cap > 0 ? Math.min(perDayRaw, cap) : perDayRaw;
  const perWeek = perDay * days;

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label={t("hoursPerDay")} suffix={u("hrs")} max={24} value={hoursPerDay} onChange={setHoursPerDay} step={0.5} />
        <NumberField label={t("daysPerWeek")} suffix={u("days")} max={7} value={days} onChange={setDays} />
        <NumberField label={t("length")} suffix={u("min")} value={length} onChange={setLength} step={5} />
        <NumberField label={t("buffer")} suffix={u("min")} value={buffer} onChange={setBuffer} step={5} />
        <NumberField label={t("busy")} suffix={u("percentOfHours")} max={100} value={busyPct} onChange={setBusyPct} hint={t("busyHint")} />
        <NumberField label={t("cap")} suffix={u("perDay")} value={cap} onChange={setCap} hint={t("capHint")} />
        <NumberField label={t("price")} prefix="$" value={price} onChange={setPrice} step={5} />
      </div>
      <InputProblem message={problem} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label={t("perWeek")} value={show(num(perWeek))} />
        <Result big label={t("perDayResult")} value={show(num(perDay))} />
        <Result label={t("hoursPerWeek")} value={show(num((perWeek * length) / 60, 1))} />
        <Result label={price > 0 ? t("revenuePerMonth") : t("perMonth")} value={show(price > 0 ? money(perWeek * price * 4.33) : num(perWeek * 4.33))} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{t("note")}</p>
    </Panel>
  );
}
