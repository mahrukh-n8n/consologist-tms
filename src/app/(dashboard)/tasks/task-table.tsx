"use client";

import { useSyncExternalStore } from "react";
import { Columns3 } from "lucide-react";
import {
  InlineAssignees,
  InlineCustomStatus,
  InlineDue,
  InlineList,
  InlinePriority,
  InlineProgress,
  InlineProject,
  InlineQuadrant,
  InlineStatus,
  InlineTags,
  InlineTitle,
  type InlineTask,
} from "./task-inline";
import type { TaskProjectOption } from "./task-editor";

export type TaskTableRow = InlineTask & {
  projectName: string;
  listName: string;
  assignees: { id: number; fullName: string; email: string }[];
  tags_detail: { id: number; title: string }[];
  customStatus: { id: number; name: string; color: string } | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS = [
  { key: "status", label: "Status" },
  { key: "assignees", label: "Assignees" },
  { key: "tags", label: "Tags" },
  { key: "customStatus", label: "Custom status" },
  { key: "quadrant", label: "Quadrant" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "progress", label: "Progress" },
  { key: "project", label: "Project" },
  { key: "list", label: "List" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Updated" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

export const DEFAULT_COLUMNS: ColumnKey[] = ["status", "assignees", "tags", "quadrant", "priority", "due", "progress"];
const KEY = "tms-task-columns-v1";
const EVENT = "tms-task-columns-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

let cache: { raw: string | null; columns: ColumnKey[] } | null = null;

function getSnapshot(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (cache && cache.raw === raw) return cache.columns;
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    const valid = parsed.filter((key): key is ColumnKey => COLUMNS.some((column) => column.key === key));
    const columns = valid.length ? valid : DEFAULT_COLUMNS;
    cache = { raw, columns };
    return columns;
  } catch {
    cache = { raw: null, columns: DEFAULT_COLUMNS };
    return DEFAULT_COLUMNS;
  }
}

export function TaskTable({
  rows,
  projects,
  customStatuses,
}: {
  rows: TaskTableRow[];
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
}) {
  const columns = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_COLUMNS);
  const visible = COLUMNS.filter((column) => columns.includes(column.key));

  function toggle(key: ColumnKey) {
    const next = columns.includes(key) ? columns.filter((column) => column !== key) : [...columns, key];
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Every cell is editable inline. Columns are saved in this browser.</p>
        <details className="relative">
          <summary id="task-columns-toggle" className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase">
            <Columns3 className="size-3.5" /> Columns ({visible.length + 1})
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg">
            <p className="px-2 pb-1 text-[11px] font-bold uppercase text-muted-foreground">Task (always shown)</p>
            {COLUMNS.map((column) => (
              <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={columns.includes(column.key)} onChange={() => toggle(column.key)} />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="block-card overflow-x-auto">
        <table className="block-table">
          <thead>
            <tr>
              <th>Task</th>
              {visible.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const members = projects.find((project) => project.id === row.projectId)?.members ?? [];
              const lists = projects.find((project) => project.id === row.projectId)?.lists ?? [];
              return (
                <tr key={row.id}>
                  <td className="min-w-56"><InlineTitle task={row} /></td>
                  {visible.map((column) => (
                    <td key={column.key} className="align-middle">
                      {column.key === "status" ? <InlineStatus task={row} /> : null}
                      {column.key === "assignees" ? <InlineAssignees task={row} members={members} /> : null}
                      {column.key === "tags" ? <InlineTags task={row} /> : null}
                      {column.key === "customStatus" ? <InlineCustomStatus task={row} options={customStatuses} /> : null}
                      {column.key === "quadrant" ? <InlineQuadrant task={row} /> : null}
                      {column.key === "priority" ? <InlinePriority task={row} /> : null}
                      {column.key === "due" ? <InlineDue task={row} /> : null}
                      {column.key === "progress" ? <InlineProgress task={row} /> : null}
                      {column.key === "project" ? <InlineProject task={row} projects={projects} /> : null}
                      {column.key === "list" ? <InlineList task={row} lists={lists} /> : null}
                      {column.key === "created" ? <span className="whitespace-nowrap text-sm text-muted-foreground">{row.createdAt.slice(0, 10)}</span> : null}
                      {column.key === "updated" ? <span className="whitespace-nowrap text-sm text-muted-foreground">{row.updatedAt.slice(0, 10)}</span> : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
