"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type BlockOption = { value: string; label: string; tone?: "lime" | "pink" | "cyan" | "orange" | "sun" | "purple" | "paper" };

export function BlockSelect({
  name,
  id,
  value,
  onChange,
  options,
  placeholder = "Select",
  className,
  compact = false,
}: {
  name?: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: BlockOption[];
  placeholder?: string;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className={className}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id ?? name}
            type="button"
            className={compact
              ? "flex min-h-8 w-full items-center justify-between gap-1 rounded-lg border border-border bg-card px-2 py-1 text-left text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2 text-left text-sm font-bold shadow-[3px_3px_0_var(--ink)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className={compact ? "size-3 shrink-0" : "size-4 shrink-0"} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(18rem,calc(100vw-2rem))] block-card p-1.5" align="start">
          <div role="listbox" className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border-2 px-2 py-1.5 text-left text-sm font-semibold",
                    active ? "border-ink bg-muted" : "border-transparent hover:border-ink"
                  )}
                >
                  <span className={cn("chip", option.tone ? `chip-${option.tone}` : "chip-paper")}>{option.label}</span>
                  {active ? <Check className="size-4" /> : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
