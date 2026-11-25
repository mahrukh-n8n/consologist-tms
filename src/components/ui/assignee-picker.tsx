"use client";

import { useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssigneeOption = { id: number; fullName: string; email: string };

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function AssigneePicker({
  members,
  value,
  onChange,
  name = "assigneeIds",
  id = "assigneeIds",
  compact = false,
}: {
  members: AssigneeOption[];
  value: number[];
  onChange: (next: number[]) => void;
  name?: string;
  id?: string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(
    () => value.map((userId) => members.find((m) => m.id === userId)).filter(Boolean) as AssigneeOption[],
    [members, value]
  );
  const filtered = members.filter((member) => {
    const q = query.trim().toLowerCase();
    return !q || member.fullName.toLowerCase().includes(q) || member.email.toLowerCase().includes(q);
  });
  const toggle = (userId: number) =>
    onChange(value.includes(userId) ? value.filter((idValue) => idValue !== userId) : [...value, userId]);

  return (
    <div className="space-y-2">
      {value.map((userId) => (
        <input key={userId} type="hidden" name={name} value={userId} />
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            data-compact={compact}
            className="block-input picker-trigger justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              {compact && selected.length > 0 ? (
                <span className="flex -space-x-1.5">
                  {selected.slice(0, 3).map((member) => (
                    <span
                      key={member.id}
                      title={member.fullName}
                      className="flex size-5 items-center justify-center rounded-full border border-ink bg-accent text-[9px] font-extrabold leading-none"
                    >
                      {initials(member.fullName)}
                    </span>
                  ))}
                </span>
              ) : (
                <Users className={compact ? "size-3.5 shrink-0 text-primary" : "size-4 shrink-0 text-primary"} />
              )}
              <span className="truncate">
                {selected.length === 0
                  ? "Assign people"
                  : selected.map((member) => member.fullName).join(", ")}
              </span>
            </span>
            {selected.length > 0 ? (
              <span className={compact ? "shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground" : "chip chip-purple shrink-0"}>{selected.length}</span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] block-card p-0" align="start">
          <div className="border-b-2 border-ink p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                compact
                className="pl-9"
                aria-label="Search assignees"
              />
            </div>
          </div>
          <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No project members found.</p>
            ) : filtered.map((member) => {
              const active = value.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggle(member.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-left text-sm transition",
                    active ? "border-ink bg-accent" : "border-transparent hover:border-ink hover:bg-muted"
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-card text-[0.65rem] font-extrabold">
                    {initials(member.fullName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{member.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                  </span>
                  {active ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t-2 border-ink p-2">
            <button type="button" className="text-xs font-bold underline" onClick={() => onChange([])}>Clear all</button>
            <span className="text-xs text-muted-foreground">{members.length} members</span>
          </div>
        </PopoverContent>
      </Popover>
      {!compact && selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((member) => (
            <span key={member.id} className="chip chip-lime">
              {member.fullName}
              <button type="button" aria-label={`Remove ${member.fullName}`} onClick={() => toggle(member.id)}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
