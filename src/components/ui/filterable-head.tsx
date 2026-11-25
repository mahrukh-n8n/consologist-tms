"use client";

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface FilterableHeadProps {
  label: string;
  field: string;
  sortField: string;
  sortDir: "asc" | "desc";
  filterValue: string;
  isEditing: boolean;
  onSort: () => void;
  onFilterChange: (value: string) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  submitFilterOnEnter?: boolean;
  className?: string;
  resizable?: boolean;
  disableResize?: boolean;
  minWidth?: number;
  maxWidth?: number;
  initialWidth?: number;
}

/**
 * FilterableHead — a <TableHead> that doubles as a sort + inline filter control.
 *
 * States:
 *  - Default: label + sort indicator. Hover reveals a search icon.
 *  - Editing: entire cell becomes a focused input.
 *  - Has filter: label + dot indicator + ×. Click dot to re-edit.
 *
 * Usage (in each table):
 *   const [editingCol, setEditingCol] = useState<string | null>(null);
 *   const fh = (field: string, label: string, cls?: string) => ({
 *     label, field, sortField, sortDir,
 *     filterValue: filters[field] ?? "",
 *     isEditing: editingCol === field,
 *     onSort: () => toggleSort(field),
 *     onFilterChange: (v: string) => setFilter(field, v),
 *     onEditStart: () => setEditingCol(field),
 *     onEditEnd: () => setEditingCol(null),
 *     ...(cls ? { className: cls } : {}),
 *   });
 *   <FilterableHead {...fh("name", "Name")} />
 */
export function FilterableHead({
  label,
  field,
  sortField,
  sortDir,
  filterValue,
  isEditing,
  onSort,
  onFilterChange,
  onEditStart,
  onEditEnd,
  submitFilterOnEnter = false,
  className,
  resizable,
  disableResize,
  minWidth,
  maxWidth,
  initialWidth,
}: FilterableHeadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLTableCellElement>(null);
  function finishEditing(restoreFocus = false) {
    onEditEnd();
    if (restoreFocus)
      queueMicrotask(() =>
        headRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
      );
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const isSorted = sortField === field;
  const sortIndicator = isSorted
    ? <span className="text-[10px] leading-none">{sortDir === "asc" ? "↑" : "↓"}</span>
    : <span className="text-[10px] leading-none opacity-25">↕</span>;

  const hasFilter = filterValue.trim().length > 0;

  /* ── Editing state ── */
  if (isEditing) {
    return (
      <TableHead
        ref={headRef}
        className={cn("p-0 bg-primary/10 border-b-2 border-primary/30", className)}
        resizable={resizable}
        disableResize={disableResize}
        minWidth={minWidth}
        maxWidth={maxWidth}
        initialWidth={initialWidth}
      >
        <div
          className="flex items-center gap-1.5 px-2 h-10"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) finishEditing();
          }}
        >
          <Search className="h-3 w-3 text-primary/50 shrink-0" />
          <input
            ref={inputRef}
            {...(submitFilterOnEnter
              ? { defaultValue: filterValue }
              : { value: filterValue })}
            onChange={(e) => {
              if (!submitFilterOnEnter) onFilterChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onFilterChange("");
                finishEditing(true);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (submitFilterOnEnter) {
                  onFilterChange(inputRef.current?.value ?? "");
                }
                finishEditing(true);
              }
            }}
            placeholder={`${label}…`}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs font-normal text-foreground placeholder:text-muted-foreground/50"
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onFilterChange("");
              finishEditing(true);
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear and close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </TableHead>
    );
  }

  /* ── Default / active-filter state ── */
  return (
    <TableHead
      ref={headRef}
      aria-sort={isSorted ? sortDir === "asc" ? "ascending" : "descending" : "none"}
      className={cn(
        "group select-none whitespace-nowrap",
        hasFilter && "bg-primary/5",
        className,
      )}
      resizable={resizable}
      disableResize={disableResize}
      minWidth={minWidth}
      maxWidth={maxWidth}
      initialWidth={initialWidth}
    >
      <div className="flex items-center gap-1">
        {/* Sort trigger */}
        <button
          onClick={onSort}
          className="flex items-center gap-0.5 cursor-pointer hover:text-foreground"
        >
          <span>{label}</span>
          <span className="ml-0.5">{sortIndicator}</span>
        </button>

        {/* Filter controls */}
        {hasFilter ? (
          <div className="flex items-center gap-0.5 ml-0.5">
            <button
              onClick={onEditStart}
              className="flex items-center gap-0.5 rounded px-0.5 py-0.5 text-primary hover:bg-primary/10 transition-colors"
              title={`Filtered: "${filterValue}" — click to edit`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <Search className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={() => onFilterChange("")}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear filter"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onEditStart}
            className="ml-0.5 rounded p-0.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-muted-foreground hover:bg-muted transition-all duration-150"
            title={`Filter by ${label}`}
          >
            <Search className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </TableHead>
  );
}
