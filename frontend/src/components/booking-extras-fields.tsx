"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const DEFAULT_BOOKING_EXTRAS = {
  min_notice_minutes: 0,
  max_days_ahead: null as number | null,
  reminder_minutes: [1440],
  remind_host: false,
};

export function BookingExtrasFields({ value, onChange }: {
  value: typeof DEFAULT_BOOKING_EXTRAS;
  onChange: (change: Partial<typeof DEFAULT_BOOKING_EXTRAS>) => void;
}) {
  const t = useTranslations("eventTypes.extras");
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="min-notice">{t("minNotice")}</Label>
        <Select value={String(value.min_notice_minutes)} onValueChange={(v) => onChange({ min_notice_minutes: Number(v) })}>
          <SelectTrigger id="min-notice"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0, 60, 240, 720, 1440, 2880].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? t("hours", { count: minutes / 60 }) : t("none")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="booking-window">{t("window")}</Label>
        <Select value={value.max_days_ahead === null ? "none" : String(value.max_days_ahead)} onValueChange={(v) => onChange({ max_days_ahead: v === "none" ? null : Number(v) })}>
          <SelectTrigger id="booking-window"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("none")}</SelectItem>
            {[7, 14, 30, 60, 90].map((days) => <SelectItem key={days} value={String(days)}>{t("daysAhead", { count: days })}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{t("windowHelp")}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">{t("reminders")}</legend>
        {([[15, t("minutesBefore", { count: 15 })], [60, t("hoursBefore", { count: 1 })], [1440, t("hoursBefore", { count: 24 })]] as const).map(([minutes, label]) => (
          <label key={minutes} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.reminder_minutes.includes(Number(minutes))} onChange={(e) => onChange({ reminder_minutes: e.target.checked ? [...value.reminder_minutes, Number(minutes)] : value.reminder_minutes.filter((m) => m !== minutes) })} />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.reminder_minutes.length === 0} onChange={() => onChange({ reminder_minutes: [] })} />
          {t("none")}
        </label>
      </fieldset>
      <div className="flex items-center justify-between">
        <Label htmlFor="remind-host">{t("remindHost")}</Label>
        <Switch id="remind-host" checked={value.remind_host} onCheckedChange={(checked) => onChange({ remind_host: checked })} />
      </div>
    </div>
  );
}
