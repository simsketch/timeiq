"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NumberField, Panel, Result, useNumbers } from "./ui";

/** What a recurring meeting costs in salary time. */
export function MeetingCostCalculator() {
  const t = useTranslations("tools.meetingCost");
  const u = useTranslations("tools.units");
  const { money, num } = useNumbers();
  const [people, setPeople] = useState(6);
  const [salary, setSalary] = useState(85000);
  const [minutes, setMinutes] = useState(60);
  const [perWeek, setPerWeek] = useState(1);
  const [overhead, setOverhead] = useState(30);

  const hourly = (salary * (1 + overhead / 100)) / 2080;
  const perMeeting = hourly * people * (minutes / 60);
  const yearly = perMeeting * perWeek * 50;
  const hoursYear = people * (minutes / 60) * perWeek * 50;

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label={t("people")} value={people} onChange={setPeople} />
        <NumberField label={t("salary")} prefix="$" value={salary} onChange={setSalary} step={1000} />
        <NumberField label={t("length")} suffix={u("minutes")} value={minutes} onChange={setMinutes} step={5} />
        <NumberField label={t("perWeek")} value={perWeek} onChange={setPerWeek} step={0.5} hint={t("perWeekHint")} />
        <NumberField label={t("overhead")} suffix={u("percentOnSalary")} value={overhead} onChange={setOverhead} hint={t("overheadHint")} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label={t("perMeeting")} value={money(perMeeting)} />
        <Result big label={t("perYear")} value={money(yearly)} />
        <Result label={t("peopleHours")} value={num(hoursYear)} />
        <Result label={t("savings")} value={minutes > 30 ? u("perYearSuffix", { amount: money(yearly * (1 - 30 / minutes)) }) : "—"} />
      </div>
    </Panel>
  );
}
