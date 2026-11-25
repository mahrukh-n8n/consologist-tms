"use client";

import { useEffect, useState, type RefObject } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type OutlineHeading = { id: number; element: HTMLHeadingElement; label: string; level: number };
type OutlineBranch = OutlineHeading & { children: OutlineBranch[] };

export function useDocumentOutline(container: RefObject<HTMLElement | null>, open: boolean) {
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);

  useEffect(() => {
    const host = container.current;
    if (!open || !host) return;
    const refresh = () => {
      const prose = host.querySelector(".portfolio-document-prose");
      if (!prose) return;
      const found: OutlineHeading[] = [];
      let index = 0;
      for (const element of prose.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")) {
        const label = element.textContent?.trim();
        if (!label) continue;
        found.push({ id: index++, element, label, level: Number(element.tagName[1]) });
      }
      setHeadings(found);
    };
    queueMicrotask(refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [container, open]);

  return headings;
}

function groupHeadings(headings: OutlineHeading[]) {
  const roots: OutlineBranch[] = [];
  const ancestors: OutlineBranch[] = [];
  const parents = new Set<number>();
  for (const heading of headings) {
    while ((ancestors.at(-1)?.level ?? 0) >= heading.level) ancestors.pop();
    const branch: OutlineBranch = { ...heading, children: [] };
    const parent = ancestors.at(-1);
    if (parent) {
      parent.children.push(branch);
      parents.add(parent.id);
    } else {
      roots.push(branch);
    }
    ancestors.push(branch);
  }
  return { roots, parents };
}

export function DocumentOutline({
  headings,
  collapsed,
  onCollapseChange,
  onJump,
}: {
  headings: OutlineHeading[];
  collapsed: Set<number>;
  onCollapseChange: (update: Set<number>) => void;
  onJump: (element: HTMLHeadingElement) => void;
}) {
  if (headings.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">Add headings to see the outline.</p>;
  }
  const { roots, parents } = groupHeadings(headings);

  function toggle(id: number) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onCollapseChange(next);
  }

  function render(branches: OutlineBranch[], nested = false): React.ReactNode {
    return branches.map((branch) => {
      const folded = collapsed.has(branch.id);
      return (
        <li key={branch.id}>
          <div className="flex min-w-0 items-start gap-0.5">
            {branch.children.length > 0 ? (
              <button
                type="button"
                onClick={() => toggle(branch.id)}
                aria-label={`${folded ? "Expand" : "Collapse"} ${branch.label}`}
                aria-expanded={!folded}
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                {folded ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            ) : <span aria-hidden="true" className="size-6 shrink-0" />}
            <button
              type="button"
              onClick={() => onJump(branch.element)}
              title={branch.label}
              className={cn(
                "min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                !nested && "font-bold",
                branch.level > 2 && "text-muted-foreground"
              )}
            >
              {branch.label}
            </button>
          </div>
          {branch.children.length > 0 && !folded ? (
            <ul className="ml-3 space-y-0.5 border-l border-border pl-1">{render(branch.children, true)}</ul>
          ) : null}
        </li>
      );
    });
  }

  return (
    <nav aria-label="Document outline" className="space-y-1 text-sm">
      {parents.size > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-border pb-1">
          <button type="button" onClick={() => onCollapseChange(new Set())} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:bg-muted">
            <ChevronsUpDown className="size-3.5" /> Expand all
          </button>
          <button type="button" onClick={() => onCollapseChange(parents)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:bg-muted">
            <ChevronsDownUp className="size-3.5" /> Collapse all
          </button>
        </div>
      ) : null}
      <ul className="space-y-0.5">{render(roots)}</ul>
    </nav>
  );
}
