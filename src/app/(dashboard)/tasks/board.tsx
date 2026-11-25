"use client";

import { InlineAssignees, InlineDue, InlinePriority, InlineQuadrant, InlineStatus, InlineTags, InlineTitle, type InlineTask } from "./task-inline";
import { presentTask, type TaskWithRelations } from "@/lib/tasks/query";
import type { TaskProjectOption } from "./task-editor";

const COLUMNS = [
  { key: "NO_PROGRESS", label: "No Progress", tone: "border-t-slate-400" },
  { key: "IN_PROGRESS", label: "In Progress", tone: "border-t-amber-400" },
  { key: "COMPLETED", label: "Completed", tone: "border-t-emerald-400" },
] as const;

function toInline(task: TaskWithRelations): InlineTask {
  const row = presentTask(task);
  return {
    id: row.id,
    projectId: task.projectId,
    listId: task.listId,
    title: row.title,
    status: row.status,
    priority: row.priority,
    quadrant: row.quadrant,
    dueAt: row.dueAt,
    progress: task.progress,
    customStatusId: task.customStatusId ?? null,
    assigneeIds: row.assignees.map((assignee) => assignee.id),
    tags: row.tags.map((tag) => tag.title),
  };
}

export function TaskBoard({
  tasks,
  projects,
}: {
  tasks: TaskWithRelations[];
  projects: TaskProjectOption[];
}) {
  const rows = tasks.map((task) => ({ inline: toInline(task), task }));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {COLUMNS.map((column) => {
        const items = rows.filter((entry) => entry.inline.status === column.key);
        return (
          <section key={column.key} className={`block-card border-t-4 ${column.tone} p-3`}>
            <header className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">{column.label}</h2>
              <span className="chip chip-paper">{items.length}</span>
            </header>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nothing here.</p>
              ) : items.map(({ inline, task }) => {
                const members = projects.find((project) => project.id === inline.projectId)?.members ?? [];
                return (
                  <article key={task.id} className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
                    <InlineTitle task={inline} />
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <InlineStatus task={inline} />
                      <InlinePriority task={inline} />
                      <InlineDue task={inline} />
                      <InlineAssignees task={inline} members={members} />
                      <InlineQuadrant task={inline} />
                    </div>
                    <InlineTags task={inline} />
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
