"use client";

import Link from "next/link";
import { useState } from "react";
import { Filter, ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotifyForm } from "@/components/ui/notify-form";
import { TaskFilters } from "./task-filters";
import { TaskCreateForm } from "./task-form";
import { ArchiveListButton, DeleteListButton } from "./list-actions";
import { createTaskListAction, renameTaskListAction } from "./actions";
import type { TaskProjectOption } from "./task-editor";

type Panel = "filters" | "lists" | "new" | null;

export type ToolbarList = {
  id: number;
  name: string;
  projectName: string;
  count: number;
};

export function TasksToolbar({
  view,
  projects,
  customStatuses,
  filters,
  assignees,
  lists,
  savedFilters,
}: {
  view: string;
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
  filters: { q: string; projectId: string; listId: string; status: string; priority: string; quadrant: string; assigneeId: string; due: string };
  assignees: { id: number; fullName: string; email: string }[];
  lists: ToolbarList[];
  savedFilters: { id: number; title: string; filter: Record<string, string> }[];
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const filterCount = [filters.q, filters.projectId, filters.listId, filters.status, filters.priority, filters.quadrant, filters.assigneeId, filters.due].filter(Boolean).length;
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={filters.q || filterCount ? "default" : "outline"} size="sm" onClick={() => toggle("filters")} aria-expanded={panel === "filters"} id="toolbar-filters">
          <Filter className="size-3.5" /> Filters{filterCount ? ` (${filterCount})` : ""}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => toggle("lists")} aria-expanded={panel === "lists"} id="toolbar-lists">
          <ListChecks className="size-3.5" /> Lists ({lists.length})
        </Button>
        <Button type="button" size="sm" onClick={() => toggle("new")} aria-expanded={panel === "new"} id="toolbar-new-task">
          <Plus className="size-3.5" /> New task
        </Button>
      </div>

      {panel === "filters" ? (
        <div className="rounded-xl border border-border bg-card p-2">
          <TaskFilters
            view={view}
            projects={projects.map((project) => ({ id: project.id, name: project.name, lists: project.lists }))}
            assignees={assignees}
            current={filters}
            savedFilters={savedFilters}
          />
        </div>
      ) : null}

      {panel === "lists" ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-heading text-sm font-extrabold uppercase">Task lists</p>
            <Link href="/tasks?archived=1" className="text-[11px] font-bold uppercase text-primary underline">Archived lists</Link>
            <button type="button" onClick={() => setPanel(null)} aria-label="Close lists" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </div>
          <NotifyForm
            action={createTaskListAction}
            actionId="create-list"
            submitLabel="Create list"
            successTitle="Task list created"
            errorTitle="List not created"
            fields={[
              { kind: "select", name: "projectId", label: "Project", required: true, options: projects.map((project) => ({ value: String(project.id), label: project.name })) },
              { kind: "text", name: "name", label: "List name", required: true, placeholder: "e.g. Backlog" },
            ]}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {lists.map((list) => (
              <div key={list.id} className="rounded-lg border border-border p-2 text-xs">
                <p className="font-bold">{list.name}</p>
                <p className="text-muted-foreground">{list.projectName} · {list.count} tasks</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] font-bold uppercase text-muted-foreground">Manage</summary>
                  <div className="mt-1 space-y-1">
                    <NotifyForm
                      action={renameTaskListAction}
                      actionId={`rename-list-${list.id}`}
                      submitLabel="Rename"
                      successTitle="List renamed"
                      errorTitle="List not renamed"
                      className="flex flex-wrap items-end gap-1"
                      fields={[
                        { kind: "hidden", name: "listId", defaultValue: String(list.id) },
                        { kind: "text", name: "name", label: "Name", required: true, defaultValue: list.name },
                      ]}
                    />
                    <ArchiveListButton listId={list.id} name={list.name} />
                    <DeleteListButton listId={list.id} name={list.name} />
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {panel === "new" ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Create task">
          <button type="button" className="flex-1 cursor-default" aria-label="Close task drawer" onClick={() => setPanel(null)} />
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-heading text-lg font-extrabold uppercase">New task</p>
              <button id="drawer-close" type="button" onClick={() => setPanel(null)} aria-label="Close task drawer" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <TaskCreateForm
              customStatuses={customStatuses}
              canCustomStatuses
              projects={projects.map((project) => ({
                id: project.id,
                name: project.name,
                lists: project.lists,
                members: project.members,
                tags: [],
              }))}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
