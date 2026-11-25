"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { BlockSelect } from "@/components/ui/block-select";
import { AssigneePicker } from "@/components/ui/assignee-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TagInput } from "@/components/ui/tag-input";
import { QUADRANT_OPTIONS } from "../task-inline";
import { notify } from "@/lib/notifications/client";
import { updateTaskDetailsAction, type TaskActionState } from "../actions";
import type { TaskEditData, TaskProjectOption } from "../task-editor";

const STATUS_OPTIONS = [
  { value: "NO_PROGRESS", label: "No Progress", tone: "paper" as const },
  { value: "IN_PROGRESS", label: "In Progress", tone: "cyan" as const },
  { value: "COMPLETED", label: "Completed", tone: "lime" as const },
];
const PRIORITY_OPTIONS = [
  { value: "NONE", label: "None", tone: "paper" as const },
  { value: "LOW", label: "Low", tone: "cyan" as const },
  { value: "MEDIUM", label: "Medium", tone: "sun" as const },
  { value: "HIGH", label: "High", tone: "pink" as const },
];

export function TaskInlineEditor({
  task,
  progress,
  projects,
  customStatuses,
  parentOptions = [],
  onSaved,
  onCancel,
}: {
  task: TaskEditData;
  progress: number;
  projects: TaskProjectOption[];
  customStatuses: { id: number; name: string }[];
  parentOptions?: { id: number; title: string }[];
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TaskActionState, FormData>(updateTaskDetailsAction, { success: false });
  const [projectId, setProjectId] = useState(String(task.projectId));
  const [listId, setListId] = useState(String(task.listId));
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [quadrant, setQuadrant] = useState(task.quadrant ?? "");
  const [parentId, setParentId] = useState(task.parentId ? String(task.parentId) : "");
  const [customStatusId, setCustomStatusId] = useState(task.customStatusId ? String(task.customStatusId) : "");
  const [assigneeIds, setAssigneeIds] = useState<number[]>(task.assigneeIds);
  const project = projects.find((item) => String(item.id) === projectId) ?? projects[0];

  useEffect(() => {
    if (state.error) notify.error("Task not saved", state.error, `inline-task-${task.id}`);
    if (state.success) {
      notify.success("Task updated", task.title, `inline-task-${task.id}`);
      router.refresh();
      onSaved?.();
    }
  }, [state, task.id, task.title, router, onSaved]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="quadrant" value={quadrant} />
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="description" value={task.description} />
      {customStatusId ? <input type="hidden" name="customStatusId" value={customStatusId} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor={`inline-title-${task.id}`}>Title</Label>
        <Input id={`inline-title-${task.id}`} name="title" defaultValue={task.title} required maxLength={500} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`inline-project-${task.id}`}>Project</Label>
          <SearchableSelect
            id={`inline-project-${task.id}`}
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
          <Label htmlFor={`inline-list-${task.id}`}>Task list</Label>
          <SearchableSelect
            id={`inline-list-${task.id}`}
            noClear
            value={listId}
            onChange={setListId}
            options={(project?.lists ?? []).map((list) => ({ value: String(list.id), label: list.name }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <BlockSelect id={`inline-status-${task.id}`} value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <BlockSelect id={`inline-priority-${task.id}`} value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        </div>
        <div className="space-y-1.5">
          <Label>Eisenhower quadrant</Label>
          <BlockSelect id={`inline-quadrant-${task.id}`} value={quadrant} onChange={setQuadrant} options={QUADRANT_OPTIONS} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`inline-due-${task.id}`}>Due date</Label>
          <DateTimePicker id={`inline-due-${task.id}`} name="dueAt" defaultValue={task.dueAt} placeholder="No due date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`inline-progress-${task.id}`}>Progress %</Label>
          <Input id={`inline-progress-${task.id}`} name="progress" type="number" min={0} max={100} step={5} defaultValue={progress} />
        </div>
        <div className="space-y-1.5">
          <Label>Custom status</Label>
          <BlockSelect
            id={`inline-custom-${task.id}`}
            value={customStatusId}
            onChange={setCustomStatusId}
            options={[{ value: "", label: "No custom status", tone: "paper" }, ...customStatuses.map((item) => ({ value: String(item.id), label: item.name, tone: "purple" as const }))]}
            placeholder="No custom status"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Assignees</Label>
        <AssigneePicker id={`inline-assignees-${task.id}`} members={project?.members ?? []} value={assigneeIds} onChange={setAssigneeIds} />
      </div>

      {parentOptions.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Parent task</Label>
          <BlockSelect
            id={`inline-parent-${task.id}`}
            value={parentId}
            onChange={setParentId}
            options={[{ value: "", label: "No parent (top level)", tone: "paper" as const }, ...parentOptions.map((option) => ({ value: String(option.id), label: option.title, tone: "cyan" as const }))]}
          />
        </div>
      ) : null}

      <TagInput id={`inline-tags-${task.id}`} defaultValue={task.tags} suggestions={[]} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}><Save className="size-4" /> {pending ? "Saving…" : "Save changes"}</Button>
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}
