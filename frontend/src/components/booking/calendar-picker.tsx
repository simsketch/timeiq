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
      className={cn("aurora-daypicker", className)}
      classNames={{
        root: `${defaultClassNames.root}`,
        month_caption: "text-sm font-semibold tracking-tight pb-3",
        caption_label: "text-sm font-semibold tracking-tight",
        nav: "flex items-center gap-1",
        button_previous:
          "h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-foreground/5 transition-colors",
        button_next:
          "h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-foreground/5 transition-colors",
        chevron: "fill-foreground/70",
        weekday:
          "text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70 py-2 w-9",
        day: "w-9 h-9 text-sm rounded-lg transition-colors",
        day_button:
          "w-9 h-9 rounded-lg hover:bg-foreground/[0.06] transition-colors inline-flex items-center justify-center tabular-nums",
        today:
          "font-semibold text-[hsl(var(--aurora-1))] relative after:absolute after:-bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-[hsl(var(--aurora-1))]",
        selected:
          "!bg-foreground !text-background shadow-[0_4px_14px_-2px_hsl(var(--foreground)/0.35)]",
        disabled: "text-muted-foreground/40 cursor-not-allowed hover:bg-transparent",
        outside: "text-muted-foreground/40",
      }}
    />
  );
}
