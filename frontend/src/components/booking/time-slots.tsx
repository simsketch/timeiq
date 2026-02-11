"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
        <p className="text-muted-foreground">Loading available times...</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No available times for this date</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-2">
      {slots.map((slot) => (
        <Button
          key={slot}
          variant={selectedSlot === slot ? "default" : "outline"}
          className={cn(
            "w-full",
            selectedSlot === slot && "bg-primary text-primary-foreground"
          )}
          onClick={() => onSlotSelect(slot)}
        >
          {slot}
        </Button>
      ))}
    </div>
  );
}
