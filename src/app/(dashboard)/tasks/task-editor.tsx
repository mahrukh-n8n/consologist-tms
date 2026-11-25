"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AssigneePicker } from "@/components/ui/assignee-picker";
import { TagInput } from "@/components/ui/tag-input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { BlockSelect } from "@/components/ui/block-select";
import { MarkdownField } from "@/components/documents/markdown-field";
import { notify } from "@/lib/notifications/client";
import { updateTaskDetailsAction, type TaskActionState } from "./actions";
import { TaskInlineEditor } from "./[id]/inline-editor";

export type TaskEditData = {
  id: number;
  projectId: number;
  listId: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  quadrant?: string | null;
  parentId?: number | null;
  dueAt: string | null;
  customStatusId: number | null;
  progress?: number;
  assigneeIds: number[];
  tags: string[];
};

export type TaskProjectOption = {
  id: number;
  name: string;
  lists: { id: number; name: string }[];
  members: { id: number; fullName: string; email: string }[];
};

const STATUS_OPTIONS = [
  { value: "NO_PROGRESS", label: "No Progress", tone: "paper" as const },
  { value: "IN_PROGRESS", label: "In Progress", tone: "cyan" as const },
  { value: "COMPLETED", label: "Completed", tone: "lime" as const },
];
const QUADRANT_OPTIONS = [
  { value: "", label: "No quadrant", tone: "paper" as const },
  { value: "DO_FIRST", label: "Do first", tone: "pink" as const },
  { value: "SCHEDULE", label: "Schedule", tone: "cyan" as const },
  { value: "DELEGATE", label: "Delegate", tone: "sun" as const },
  { value: "ELIMINATE", label: "Eliminate", tone: "paper" as const },
];
const PRIORITY_OPTIONS = [
  { value: "NONE", label: "None", tone: "paper" as const },
  { value: "LOW", label: "Low", tone: "cyan" as const },
  { value: "MEDIUM", label: "Medium", tone: "sun" as const },
  { value: "HIGH", label: "High", tone: "pink" as const },
];

export function TaskEditButton({
  task,
  projects,
  customStatuses,
  compact = false,
}: {
  task: TaskEditData;
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon-sm" : "sm"}
        onClick={() => setOpen(true)}
        aria-label={`Edit ${task.title}`}
      >
        <Pencil className="size-3.5" />{compact ? null : "Edit"}
      </Button>
      {open ? <TaskEditDialog task={task} projects={projects} customStatuses={customStatuses} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function TaskInlinePanel({
  task,
  projects,
  customStatuses,
}: {
  task: TaskEditData;
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Edit ${task.title}`}>
        <Pencil className="size-3.5" /> {open ? "Close editor" : "Edit"}
      </Button>
      {open ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-3">
          <TaskInlineEditor
            task={task}
            progress={task.progress ?? 0}
            projects={projects}
            customStatuses={customStatuses}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function TaskEditDialog({
  task,
  projects,
  customStatuses,
  onClose,
}: {
  task: TaskEditData;
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TaskActionState, FormData>(updateTaskDetailsAction, { success: false });
  const [projectId, setProjectId] = useState(String(task.projectId));
  const [listId, setListId] = useState(String(task.listId));
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [quadrant, setQuadrant] = useState(task.quadrant ?? "");
  const [customStatusId, setCustomStatusId] = useState(task.customStatusId ? String(task.customStatusId) : "");
  const [assigneeIds, setAssigneeIds] = useState<number[]>(task.assigneeIds);

  const project = projects.find((item) => String(item.id) === projectId) ?? projects[0];

  useEffect(() => {
    if (state.error) notify.error("Task not saved", state.error, `edit-task-${task.id}`);
    if (state.success) {
      notify.success("Task updated", task.title, `edit-task-${task.id}`);
      router.refresh();
      onClose();
    }
  }, [state, task.id, task.title, router, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={`Edit ${task.title}`}>
      <form action={action} className="block-card w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-xl font-extrabold uppercase">Edit task</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close editor"><X className="size-4" /></Button>
        </div>

        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="priority" value={priority} />
        <input type="hidden" name="quadrant" value={quadrant} />
        {customStatusId ? <input type="hidden" name="customStatusId" value={customStatusId} /> : null}

        <div className="space-y-1.5">
          <Label htmlFor={`edit-title-${task.id}`}>Title</Label>
          <Input id={`edit-title-${task.id}`} name="title" defaultValue={task.title} required maxLength={500} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-project-${task.id}`}>Project</Label>
            <SearchableSelect
              id={`edit-project-${task.id}`}
              noClear
              value={projectId}
              onChange={(next) => {
                setProjectId(next);
                const nextProject = projects.find((item) => String(item.id) === next);
                setListId(String(nextProject?.lists[0]?.id ?? ""));
              }}
              options={projects.map((item) => ({ value: String(item.id), label: item.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-list-${task.id}`}>Task list</Label>
            <SearchableSelect
              id={`edit-list-${task.id}`}
              noClear
              value={listId}
              onChange={setListId}
              options={(project?.lists ?? []).map((list) => ({ value: String(list.id), label: list.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <BlockSelect id={`edit-status-${task.id}`} value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <BlockSelect id={`edit-priority-${task.id}`} value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label>Eisenhower quadrant</Label>
            <BlockSelect id={`edit-quadrant-${task.id}`} value={quadrant} onChange={setQuadrant} options={QUADRANT_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <DateTimePicker id={`edit-due-${task.id}`} name="dueAt" defaultValue={task.dueAt} placeholder="No due date" />
          </div>
          <div className="space-y-1.5">
            <Label>Custom status</Label>
            <BlockSelect
              id={`edit-custom-${task.id}`}
              value={customStatusId}
              onChange={setCustomStatusId}
              options={[{ value: "", label: "No custom status", tone: "paper" }, ...customStatuses.map((item) => ({ value: String(item.id), label: item.name, tone: "purple" as const }))]}
              placeholder="No custom status"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Assignees</Label>
          <AssigneePicker id={`edit-assignees-${task.id}`} members={project?.members ?? []} value={assigneeIds} onChange={setAssigneeIds} />
        </div>

        <TagInput id={`edit-tags-${task.id}`} defaultValue={task.tags} suggestions={[...new Set(projects.flatMap((item) => item.lists.map((list) => list.name)))]} />

        <MarkdownField name="description" label="Description" defaultValue={task.description} id={`edit-description-${task.id}`} minHeight={180} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save task"}</Button>
        </div>
      </form>
    </div>
  );
}
