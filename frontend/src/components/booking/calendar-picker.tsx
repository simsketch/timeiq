"use client";

import { DayPicker, getDefaultClassNames } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

interface CalendarPickerProps {
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  disabledDates?: Date[];
  className?: string;
}

export function CalendarPicker({
  selectedDate,
  onDateSelect,
  disabledDates = [],
  className,
}: CalendarPickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      mode="single"
      selected={selectedDate}
      onSelect={onDateSelect}
      disabled={(date) => {
        if (date < today) return true;
        return disabledDates.some(
          (disabledDate) =>
            disabledDate.toDateString() === date.toDateString()
        );
      }}
      className={cn("p-3", className)}
      classNames={{
        today: "border-2 border-blue-500 font-semibold",
        selected: "bg-blue-500 text-white rounded-md",
        root: `${defaultClassNames.root}`,
        chevron: `${defaultClassNames.chevron} fill-blue-500`,
        disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
      }}
    />
  );
}
