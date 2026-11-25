"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function toIso(date: Date, time: string, dateOnly: boolean) {
  if (dateOnly) return format(date, "yyyy-MM-dd");
  const [hours = "00", minutes = "00"] = time.split(":");
  const next = new Date(date);
  next.setHours(Number(hours), Number(minutes), 0, 0);
  return next.toISOString();
}

export function DateTimePicker({
  name,
  id,
  defaultValue,
  dateOnly = false,
  placeholder = "Pick a date",
  className,
  onChange,
  compact = false,
}: {
  name: string;
  id?: string;
  defaultValue?: string | null;
  dateOnly?: boolean;
  placeholder?: string;
  className?: string;
  onChange?: (value: string | null) => void;
  compact?: boolean;
}) {
  const initial = defaultValue ? new Date(defaultValue) : undefined;
  const [date, setDate] = useState<Date | undefined>(initial && !Number.isNaN(initial.getTime()) ? initial : undefined);
  const [time, setTime] = useState(
    initial && !Number.isNaN(initial.getTime())
      ? `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`
      : "09:00"
  );
  const value = date ? toIso(date, time, dateOnly) : "";

  function commit(nextDate: Date | undefined, nextTime = time) {
    setDate(nextDate);
    setTime(nextTime);
    onChange?.(nextDate ? toIso(nextDate, nextTime, dateOnly) : null);
  }

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-2", className)}>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={id ?? name}
            type="button"
            data-compact={compact}
            className="block-input picker-trigger"
          >
            <CalendarDays className={compact ? "size-3.5 shrink-0 text-primary" : "size-4 shrink-0 text-primary"} />
            <span className={cn("truncate", !date && "text-muted-foreground")}>
              {date ? `${format(date, "dd MMM yyyy")}${dateOnly ? "" : ` · ${time}`}` : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="block-card max-w-[calc(100vw-2rem)] overflow-x-auto p-3" align="start">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(next) => commit(next)}
            showOutsideDays
            className="tms-daypicker"
          />
          {!dateOnly ? (
            <div className="mt-3 border-t-2 border-ink pt-3">
              <label htmlFor={`${id ?? name}-time`} className="eyebrow">Time</label>
              <Input
                id={`${id ?? name}-time`}
                type="time"
                value={time}
                onChange={(event) => commit(date, event.target.value)}
                compact
                className="mt-1"
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {date ? (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => commit(undefined)}
          data-compact={compact}
          className="block-input flex aspect-square shrink-0 items-center justify-center px-0 hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      ) : null}
      </div>
    </div>
  );
}
