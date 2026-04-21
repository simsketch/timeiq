"use client";

import { cn } from "@/lib/utils";
import { ClockLoader } from "@/components/ui/clock-loader";

interface TimeSlotsProps {
  slots: string[];
  selectedSlot: string | null;
  onSlotSelect: (slot: string) => void;
  loading?: boolean;
}

export function TimeSlots({
  slots,
  selectedSlot,
  onSlotSelect,
  loading = false,
}: TimeSlotsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ClockLoader size="md" label="Checking availability" />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground mb-1">No times available</p>
        <p className="text-xs text-muted-foreground/70">Try another date</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 max-h-[22rem] overflow-y-auto pr-1">
      {slots.map((slot) => {
        const isSelected = selectedSlot === slot;
        return (
          <button
            key={slot}
            type="button"
            onClick={() => onSlotSelect(slot)}
            className={cn(
              "relative h-11 rounded-xl text-sm font-mono tabular-nums transition-all duration-300 ease-out",
              isSelected
                ? "bg-foreground text-background shadow-[0_6px_20px_-6px_hsl(var(--foreground)/0.5)] scale-[1.02]"
                : "border border-foreground/10 bg-background/40 backdrop-blur-md text-foreground/80 hover:text-foreground hover:border-foreground/20 hover:bg-background/60"
            )}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}
