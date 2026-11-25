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
      <div className="flex gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={id ?? name}
            type="button"
            className={compact
              ? "flex min-h-8 w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-left text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "flex min-h-11 w-full items-center gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2 text-left text-sm font-semibold shadow-[3px_3px_0_var(--ink)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"}
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
                className="mt-1 h-9 shadow-none"
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
          className={compact ? "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted" : "flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-card shadow-[3px_3px_0_var(--ink)] hover:bg-muted"}
        >
          <X className="size-4" />
        </button>
      ) : null}
      </div>
    </div>
  );
}
