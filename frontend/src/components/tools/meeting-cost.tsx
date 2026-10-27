"use client";

import { useState } from "react";
import { NumberField, Panel, Result, money, num } from "./ui";

/** What a recurring meeting costs in salary time. */
export function MeetingCostCalculator() {
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
        <NumberField label="People in the meeting" value={people} onChange={setPeople} />
        <NumberField label="Average salary" prefix="$" value={salary} onChange={setSalary} step={1000} />
        <NumberField label="Length" suffix="minutes" value={minutes} onChange={setMinutes} step={5} />
        <NumberField label="Times per week" value={perWeek} onChange={setPerWeek} step={0.5} hint="0.5 for every other week" />
        <NumberField label="Benefits and overhead" suffix="% on top of salary" value={overhead} onChange={setOverhead} hint="25–40% is typical for US employers" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Result big label="Cost per meeting" value={money(perMeeting)} />
        <Result big label="Cost per year" value={money(yearly)} />
        <Result label="People-hours per year" value={num(hoursYear)} />
        <Result label="Cutting it to 30 min saves" value={minutes > 30 ? money(yearly * (1 - 30 / minutes)) + "/yr" : "—"} />
      </div>
    </Panel>
  );
}
