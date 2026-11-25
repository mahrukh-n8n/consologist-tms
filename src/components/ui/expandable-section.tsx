"use client";

import type { ReactNode } from "react";
import { Collapsible } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact, keyboard-accessible section; contents remain available without crowding the overview. */
export function ExpandableSection({ title, summary, children, className, keepMounted = false }: {
  title: string; summary?: ReactNode; children: ReactNode; className?: string;
  /** Preserve uncontrolled form drafts while the section is collapsed. */
  keepMounted?: boolean;
}) {
  return <Collapsible.Root className={cn("w-full min-w-0 self-start rounded-lg border bg-card", className)}>
    <Collapsible.Trigger className="group flex w-full min-w-0 items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {summary && <span className="text-xs text-muted-foreground break-words">{summary}</span>}
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
    </Collapsible.Trigger>
    <Collapsible.Content forceMount={keepMounted ? true : undefined} className="min-w-0 border-t p-4 data-[state=closed]:hidden [&_a]:break-words">
      {children}
    </Collapsible.Content>
  </Collapsible.Root>;
}
