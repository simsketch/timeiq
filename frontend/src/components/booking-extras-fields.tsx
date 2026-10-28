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
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="min-notice">Minimum notice</Label>
        <Select value={String(value.min_notice_minutes)} onValueChange={(v) => onChange({ min_notice_minutes: Number(v) })}>
          <SelectTrigger id="min-notice"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0, 60, 240, 720, 1440, 2880].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}` : "None"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="booking-window">Booking window</Label>
        <Select value={value.max_days_ahead === null ? "none" : String(value.max_days_ahead)} onValueChange={(v) => onChange({ max_days_ahead: v === "none" ? null : Number(v) })}>
          <SelectTrigger id="booking-window"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {[7, 14, 30, 60, 90].map((days) => <SelectItem key={days} value={String(days)}>{days} days ahead</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">Calendar availability extends up to 90 days ahead.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Email reminders</legend>
        {[[15, "15 minutes before"], [60, "1 hour before"], [1440, "24 hours before"]].map(([minutes, label]) => (
          <label key={minutes} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.reminder_minutes.includes(Number(minutes))} onChange={(e) => onChange({ reminder_minutes: e.target.checked ? [...value.reminder_minutes, Number(minutes)] : value.reminder_minutes.filter((m) => m !== minutes) })} />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.reminder_minutes.length === 0} onChange={() => onChange({ reminder_minutes: [] })} />
          None
        </label>
      </fieldset>
      <div className="flex items-center justify-between">
        <Label htmlFor="remind-host">Send reminders to me too</Label>
        <Switch id="remind-host" checked={value.remind_host} onCheckedChange={(checked) => onChange({ remind_host: checked })} />
      </div>
    </div>
  );
}
