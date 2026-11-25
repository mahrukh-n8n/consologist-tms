"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ExternalLink, ListChecks, Trash2 } from "lucide-react";
import { presentTask, type TaskWithRelations } from "@/lib/tasks/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { notify } from "@/lib/notifications/client";
import { InlineAssignees, InlineDue, InlinePriority, InlineQuadrant, InlineStatus, InlineTags, InlineTitle, type InlineTask } from "./task-inline";
import type { TaskProjectOption } from "./task-editor";
import { bulkDeleteTasksAction, bulkTaskAction } from "./actions";

export type TaskGroup = {
  listId: number;
  listName: string;
  projectName: string;
  tasks: TaskWithRelations[];
};

export type MoveTargetList = { id: number; name: string; projectName: string };

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

export function TaskListView({
  groups,
  projects,
  lists,
}: {
  groups: TaskGroup[];
  projects: TaskProjectOption[];
  lists: MoveTargetList[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [moveListId, setMoveListId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runBulk(payload: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const data = new FormData();
      data.set("payload", JSON.stringify(payload));
      const result = await bulkTaskAction({ success: false }, data);
      if (result.error) notify.error(`${label} failed`, result.error, "task-bulk");
      else {
        notify.success(label, `${result.updated ?? 0} task(s) updated.`, "task-bulk");
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.set("taskIds", JSON.stringify([...selected]));
      data.set("reason", reason);
      const result = await bulkDeleteTasksAction({ success: false }, data);
      if (result.error) notify.error("Delete failed", result.error, "task-bulk-delete");
      else {
        notify.success("Tasks deleted", `${result.updated ?? 0} task(s) deleted with an audit snapshot.`, "task-bulk-delete");
        setSelected(new Set());
        setReason("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function dragStart(event: React.DragEvent, taskId: number) {
    setDragId(taskId);
    event.dataTransfer.setData("text/plain", String(taskId));
    event.dataTransfer.effectAllowed = "move";
  }

  function dropOnList(event: React.DragEvent, listId: number) {
    event.preventDefault();
    const taskId = Number(event.dataTransfer.getData("text/plain")) || dragId;
    setDragId(null);
    if (!taskId) return;
    void runBulk({ taskIds: [taskId], action: "move", listId, parentId: null }, "Task moved");
  }

  function dropOnTask(event: React.DragEvent, parentId: number) {
    event.preventDefault();
    event.stopPropagation();
    const taskId = Number(event.dataTransfer.getData("text/plain")) || dragId;
    setDragId(null);
    if (!taskId || taskId === parentId) return;
    void runBulk({ taskIds: [taskId], action: "move", parentId }, "Subtask moved");
  }

  const selectedIds = [...selected];

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 ? (
        <div className="block-card grid grid-cols-2 items-center gap-2 p-3 sm:flex sm:flex-wrap">
          <span className="chip chip-purple justify-self-start">{selectedIds.length} selected</span>
          <Button size="sm" className="justify-self-end" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk({ taskIds: selectedIds, action: "archive" }, "Tasks archived")}>
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk({ taskIds: selectedIds, action: "unarchive" }, "Tasks restored")}>
            <ArchiveRestore className="size-3.5" /> Unarchive
          </Button>
          <div className="col-span-full flex w-full items-center gap-2 sm:w-auto">
            <SearchableSelect
              compact
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
              placeholder="Move to list…"
              id="bulk-move-list"
              value={moveListId}
              onChange={setMoveListId}
              options={[{ value: "", label: "Move to list…" }, ...lists.map((list) => ({ value: String(list.id), label: `${list.projectName} / ${list.name}` }))]}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !moveListId}
              onClick={() => runBulk({ taskIds: selectedIds, action: "move", listId: Number(moveListId), parentId: null }, "Tasks moved")}
            >
              Move
            </Button>
          </div>
          <Button size="sm" variant="outline" className="col-span-full" disabled={busy} onClick={() => runBulk({ taskIds: selectedIds, action: "move", parentId: null }, "Parent cleared")}>
            Detach parent
          </Button>
          <div className="col-span-full flex w-full items-center gap-2 sm:w-auto">
            <Input compact className="flex-1 sm:w-36 sm:flex-none" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Delete reason" aria-label="Delete reason" />
            <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={deleteSelected}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        </div>
      ) : null}

      {groups.map((group) => {
        const members = projects.find((project) => project.name === group.projectName)?.members ?? [];
        return (
          <section
            key={group.listId}
            className="space-y-2 rounded-xl"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => dropOnList(event, group.listId)}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="eyebrow text-muted-foreground">{group.projectName}</p>
                <h3 className="flex items-center gap-2 font-heading text-lg font-extrabold uppercase">
                  <ListChecks className="size-4 text-primary" /> {group.listName}
                </h3>
                <p className="text-[11px] text-muted-foreground">Drop a task here to move it to this list.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="chip chip-paper">{group.tasks.length} tasks</span>
                <Link href={`/tasks?listId=${group.listId}`} className="text-[11px] font-bold uppercase text-primary underline">
                  Open list
                </Link>
              </div>
            </div>

            {group.tasks.length === 0 ? null : (
              <>
                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {group.tasks.map((task) => {
                    const inline = toInline(task);
                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(event) => dragStart(event, task.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => dropOnTask(event, task.id)}
                        className="block-card space-y-2 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex min-w-0 items-center gap-2">
                            <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)} aria-label={`Select ${task.title}`} />
                            <InlineTitle task={inline} scope="m" />
                          </label>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2 text-xs [&>div]:space-y-1">
                          <div><p className="eyebrow text-muted-foreground">Status</p><InlineStatus task={inline} /></div>
                          <div><p className="eyebrow text-muted-foreground">Priority</p><InlinePriority task={inline} /></div>
                          <div><p className="eyebrow text-muted-foreground">Due</p><InlineDue task={inline} /></div>
                          <div><p className="eyebrow text-muted-foreground">Assignees</p><InlineAssignees task={inline} members={members} /></div>
                          <div><p className="eyebrow text-muted-foreground">Quadrant</p><InlineQuadrant task={inline} scope="m" /></div>
                        </div>
                        <div><p className="eyebrow mb-1 text-muted-foreground">Tags</p><InlineTags task={inline} scope="m" /></div>
                      </article>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="block-card hidden overflow-x-auto md:block">
                  <table className="block-table">
                    <thead>
                      <tr>
                        <th className="w-8" />
                        <th>Task</th>
                        <th>Status</th>
                        <th>Assignees</th>
                        <th>Tags</th>
                        <th>Quadrant</th>
                        <th>Priority</th>
                        <th>Due</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => {
                        const inline = toInline(task);
                        return (
                          <tr
                            key={task.id}
                            draggable
                            onDragStart={(event) => dragStart(event, task.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => dropOnTask(event, task.id)}
                            className={dragId === task.id ? "opacity-50" : undefined}
                          >
                            <td>
                              <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)} aria-label={`Select ${task.title}`} />
                            </td>
                            <td className="min-w-56"><InlineTitle task={inline} href={false} /></td>
                            <td><InlineStatus task={inline} /></td>
                            <td><InlineAssignees task={inline} members={members} /></td>
                            <td><InlineTags task={inline} /></td>
                            <td><InlineQuadrant task={inline} /></td>
                            <td><InlinePriority task={inline} /></td>
                            <td><InlineDue task={inline} /></td>
                            <td>
                              <a href={`/tasks/${task.id}`} aria-label={`Open ${task.title}`} className="text-muted-foreground hover:text-foreground">
                                <ExternalLink className="size-3.5" />
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
