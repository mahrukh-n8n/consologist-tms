"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MarkdownField } from "@/components/documents/markdown-field";
import { AssigneePicker } from "@/components/ui/assignee-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TagInput } from "@/components/ui/tag-input";
import { BlockSelect } from "@/components/ui/block-select";
import { notify } from "@/lib/notifications/client";
import { createTaskAction, type TaskActionState } from "./actions";

type ProjectOption = {
  id: number;
  name: string;
  lists: { id: number; name: string }[];
  members: { id: number; fullName: string; email: string }[];
  tags: string[];
};

const STATUSES = [
  { value: "NO_PROGRESS", label: "No Progress", tone: "paper" as const },
  { value: "IN_PROGRESS", label: "In Progress", tone: "cyan" as const },
  { value: "COMPLETED", label: "Completed", tone: "lime" as const },
];
const QUADRANTS = [
  { value: "", label: "No quadrant", tone: "paper" as const },
  { value: "DO_FIRST", label: "Do first", tone: "pink" as const },
  { value: "SCHEDULE", label: "Schedule", tone: "cyan" as const },
  { value: "DELEGATE", label: "Delegate", tone: "sun" as const },
  { value: "ELIMINATE", label: "Eliminate", tone: "paper" as const },
];
const PRIORITIES = [
  { value: "NONE", label: "None", tone: "paper" as const },
  { value: "LOW", label: "Low", tone: "cyan" as const },
  { value: "MEDIUM", label: "Medium", tone: "sun" as const },
  { value: "HIGH", label: "High", tone: "pink" as const },
];

export function TaskCreateForm({
  projects,
  customStatuses,
  canCustomStatuses,
}: {
  projects: ProjectOption[];
  customStatuses: { id: number; name: string }[];
  canCustomStatuses: boolean;
}) {
  const [state, action, pending] = useActionState<TaskActionState, FormData>(createTaskAction, {
    success: false,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [projectId, setProjectId] = useState(String(projects[0]?.id ?? ""));
  const selectedProject = projects.find((p) => String(p.id) === projectId) ?? projects[0];
  const [listId, setListId] = useState(String(projects[0]?.lists[0]?.id ?? ""));
  const [status, setStatus] = useState("NO_PROGRESS");
  const [priority, setPriority] = useState("NONE");
  const [quadrant, setQuadrant] = useState("");
  const [customStatusId, setCustomStatusId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  useEffect(() => {
    if (!state.success && state.error) notify.error("Task not created", state.error, "task-create");
    if (state.success) {
      notify.success(
        state.approvalRequired ? "Submitted for approval" : "Task created",
        state.approvalRequired ? "A reviewer must approve this task before it exists." : "It is now on the board.",
        "task-create"
      );
      formRef.current?.reset();
    }
  }, [state]);

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-ink bg-muted p-6 text-center text-sm font-semibold">
        Create a project first, then tasks get a list to live in.
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Task title</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={500}
          placeholder="What needs to happen?"
          className="h-14 rounded-2xl text-lg font-bold"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="projectId">Project</Label>
          <SearchableSelect
            id="projectId"
            noClear
            value={projectId}
            onChange={(next) => {
              setProjectId(next);
              const project = projects.find((p) => String(p.id) === next);
              setListId(String(project?.lists[0]?.id ?? ""));
              setAssigneeIds([]);
            }}
            options={projects.map((project) => ({ value: String(project.id), label: project.name }))}
          />
          <input type="hidden" name="projectId" value={projectId} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="listId">List</Label>
          <SearchableSelect
            id="listId"
            noClear
            value={listId}
            onChange={setListId}
            options={(selectedProject?.lists ?? []).map((list) => ({
              value: String(list.id),
              label: list.name,
            }))}
          />
          <input type="hidden" name="listId" value={listId} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <BlockSelect id="status" name="status" value={status} onChange={setStatus} options={STATUSES} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <BlockSelect id="priority" name="priority" value={priority} onChange={setPriority} options={PRIORITIES} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quadrant">Eisenhower quadrant</Label>
          <BlockSelect id="quadrant" name="quadrant" value={quadrant} onChange={setQuadrant} options={QUADRANTS} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Assignees</Label>
          <AssigneePicker members={selectedProject?.members ?? []} value={assigneeIds} onChange={setAssigneeIds} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueAt">Due date</Label>
          <DateTimePicker id="dueAt" name="dueAt" placeholder="Set a due date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags</Label>
          <TagInput id="tags" suggestions={selectedProject?.tags ?? []} />
        </div>
      </div>

      {canCustomStatuses ? (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="customStatusId">Custom status</Label>
          <BlockSelect
            id="customStatusId"
            value={customStatusId}
            onChange={setCustomStatusId}
            placeholder="No custom status"
            options={[{ value: "", label: "No custom status", tone: "paper" }, ...customStatuses.map((s) => ({ value: String(s.id), label: s.name, tone: "purple" as const }))]}
          />
          {customStatusId ? <input type="hidden" name="customStatusId" value={customStatusId} /> : null}
        </div>
      ) : null}

      <details className="rounded-xl border-2 border-ink bg-muted/60 p-3">
        <summary id="task-description-toggle" className="cursor-pointer font-extrabold uppercase tracking-wide text-sm">Description</summary>
        <div className="mt-3">
          <MarkdownField name="description" label="Description" id="description" placeholder="Add context, links, or acceptance notes…" minHeight={160} />
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-4">
        <p className="text-xs font-semibold text-muted-foreground">
          {assigneeIds.length > 0 ? `${assigneeIds.length} assignee${assigneeIds.length === 1 ? "" : "s"} will be notified of due dates and comments.` : "Assign people to send due-date and comment alerts."}
        </p>
        <Button type="submit" size="lg" variant="accent" disabled={pending}>
          <Plus className="size-5" />
          {pending ? "Creating…" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
