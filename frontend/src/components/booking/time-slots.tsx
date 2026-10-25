"use client";

import { cn } from "@/lib/utils";
import { ClockLoader } from "@/components/ui/clock-loader";
import { slotOptions, timeZoneLabel } from "@/lib/booking-time";

interface TimeSlotsProps {
  /** Slots from the API; each one's ISO start is its id. */
  slots: { start: string }[];
  /** The date picked on the calendar. Slots on another guest-local day show their date. */
  date: Date;
  /** ISO start of the selected slot. */
  selectedSlot: string | null;
  onSlotSelect: (start: string) => void;
  loading?: boolean;
}

export function TimeSlots({
  slots,
  date,
  selectedSlot,
  onSlotSelect,
  loading = false,
}: TimeSlotsProps) {
  const zone = (
    <p className="text-[11px] font-mono text-muted-foreground/80 mb-4">
      Times in your timezone: {timeZoneLabel(date)}
    </p>
  );

  if (loading) {
    return (
      <>
        {zone}
        <div className="flex items-center justify-center py-12">
          <ClockLoader size="md" label="Checking availability" />
        </div>
      </>
    );
  }

  if (slots.length === 0) {
    return (
      <>
        {zone}
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground mb-1">No times available</p>
          <p className="text-xs text-muted-foreground/70">Try another date</p>
        </div>
      </>
    );
  }

  const options = slotOptions(slots, date);
  const crossesDays = options.some((o) => o.note);

  return (
    <>
      {zone}
      {crossesDays && (
        <p className="text-xs text-muted-foreground mb-3 text-pretty">
          Some of these times fall on a different day where you are. Those show their date.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 max-h-[22rem] overflow-y-auto pr-1">
        {options.map((slot) => {
          const isSelected = selectedSlot === slot.value;
          return (
            <button
              key={slot.value}
              type="button"
              onClick={() => onSlotSelect(slot.value)}
              aria-pressed={isSelected}
              className={cn(
                "relative min-h-11 py-1.5 rounded-xl text-sm font-mono tabular-nums transition-all duration-300 ease-out flex flex-col items-center justify-center leading-tight",
                isSelected
                  ? "bg-foreground text-background shadow-[0_6px_20px_-6px_hsl(var(--foreground)/0.5)] scale-[1.02]"
                  : "border border-foreground/10 bg-background/40 backdrop-blur-md text-foreground/80 hover:text-foreground hover:border-foreground/20 hover:bg-background/60"
              )}
            >
              {slot.label}
              {slot.note && (
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-[0.08em]",
                    isSelected ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  {slot.note}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
