"use client";

import { useState } from "react";

type SortDir = "asc" | "desc";

export interface FilterableTableState {
  sortField: string;
  sortDir: SortDir;
  filters: Record<string, string>;
  editingCol: string | null;
}

/**
 * useFilterableTable — shared sort + inline-filter state for ALL data tables.
 *
 * Extracts the 4-useState block duplicated across every table into a single hook.
 *
 * Usage:
 * ```tsx
 * const { fh, filtered, sorted, hasFilters, clearAllFilters } = useFilterableTable(rows, filterFn);
 *
 * function filterFn(row: Row, filters: Record<string, string>) {
 *   const m = (val: unknown, f: string) =>
 *     !f.trim() || String(val ?? "").toLowerCase().includes(f.toLowerCase());
 *   return m(row.name, filters.name ?? "") && m(row.code, filters.code ?? "");
 * }
 * ```
 *
 * The returned `fh(field, label, className?)` factory builds all props for `<FilterableHead>`.
 * The returned `sorted` is the filtered+sorted array, ready for rendering.
 *
 * For custom sorting, pass a `sortFn` option:
 * ```tsx
 * const { sorted } = useFilterableTable(rows, filterFn, {
 *   sortFn: (a, b, field, dir) => { ... return number; }
 * });
 * ```
 *
 * Without `sortFn`, sorts lexicographically by `String(row[field])`.
 */

interface UseFilterableTableOptions<T> {
  /** Custom sort comparator. Receives two rows, the active field name, and direction. */
  sortFn?: (a: T, b: T, field: string, dir: SortDir) => number;
  /** Initial sort state. Without this, table starts unsorted. */
  defaultSort?: { field: string; direction: SortDir };
  /** When true, table header filter inputs draft locally and commit only on Enter. */
  submitFiltersOnEnter?: boolean;
  /**
   * Server-backed mode. Header state comes from URL/server params and callers
   * receive changes instead of filtering/sorting the current client page.
   */
  manual?: {
    sortField: string;
    sortDir: SortDir;
    filters: Record<string, string>;
    disableClientProcessing?: boolean;
    onSortChange: (field: string, direction: SortDir) => void;
    onFilterChange: (field: string, value: string) => void;
    onClearFilters: () => void;
  };
}

export function useFilterableTable<T>(
  rows: T[],
  filterFn: (row: T, filters: Record<string, string>) => boolean,
  options?: UseFilterableTableOptions<T>,
) {
  const [sortField, setSortField] = useState<string>(options?.defaultSort?.field ?? "");
  const [sortDir, setSortDir] = useState<SortDir>(options?.defaultSort?.direction ?? "asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editingCol, setEditingCol] = useState<string | null>(null);

  const activeSortField = options?.manual?.sortField ?? sortField;
  const activeSortDir = options?.manual?.sortDir ?? sortDir;
  const activeFilters = options?.manual?.filters ?? filters;

  const toggleSort = (field: string) => {
    if (options?.manual) {
      const nextDir =
        activeSortField === field && activeSortDir === "asc" ? "desc" : "asc";
      options.manual.onSortChange(field, nextDir);
      return;
    }

    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const setFilter = (k: string, v: string) =>
    options?.manual
      ? options.manual.onFilterChange(k, v)
      : setFilters((f) => ({ ...f, [k]: v }));

  const clearAllFilters = () =>
    options?.manual ? options.manual.onClearFilters() : setFilters({});

  const hasFilters = Object.values(activeFilters).some((v) => v.trim());

  /** Factory: builds all props for `<FilterableHead field={...} label={...} />` */
  const fh = (field: string, label: string, className?: string) => ({
    label,
    field,
    sortField: activeSortField,
    sortDir: activeSortDir,
    filterValue: activeFilters[field] ?? "",
    isEditing: editingCol === field,
    onSort: () => toggleSort(field),
    onFilterChange: (v: string) => setFilter(field, v),
    onEditStart: () => setEditingCol(field),
    onEditEnd: () => setEditingCol(null),
    submitFilterOnEnter: options?.submitFiltersOnEnter ?? false,
    ...(className ? { className } : {}),
  });

  const filtered = options?.manual?.disableClientProcessing
    ? rows
    : rows.filter((row) => filterFn(row, activeFilters));

  const sorted = options?.manual?.disableClientProcessing
    ? filtered
    : [...filtered].sort((a, b) => {
        if (!activeSortField) return 0;
        if (options?.sortFn) {
          return options.sortFn(a, b, activeSortField, activeSortDir);
        }
        // Default: lexicographic by String(value)
        const dir = activeSortDir === "asc" ? 1 : -1;
        const av = String((a as Record<string, unknown>)[activeSortField] ?? "");
        const bv = String((b as Record<string, unknown>)[activeSortField] ?? "");
        return av.localeCompare(bv) * dir;
      });

  return {
    fh,
    filtered,
    sorted,
    hasFilters,
    clearAllFilters,
    filters: activeFilters,
    sortField: activeSortField,
    sortDir: activeSortDir,
  };
}
