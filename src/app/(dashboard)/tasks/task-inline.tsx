"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Loader2, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BlockSelect } from "@/components/ui/block-select";
import { AssigneePicker, type AssigneeOption } from "@/components/ui/assignee-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { notify } from "@/lib/notifications/client";
import { cn } from "@/lib/utils";
import { updateTaskInlineAction, type InlinePatch } from "./actions";
import { useTaskDrawer } from "./task-drawer";

const STATUS_OPTIONS = [
  { value: "NO_PROGRESS", label: "No Progress", tone: "paper" as const },
  { value: "IN_PROGRESS", label: "In Progress", tone: "cyan" as const },
  { value: "COMPLETED", label: "Completed", tone: "lime" as const },
];
export const QUADRANT_OPTIONS = [
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

export type InlineTask = {
  id: number;
  projectId: number;
  listId: number;
  title: string;
  status: string;
  priority: string;
  quadrant: string | null;
  dueAt: string | null;
  progress: number;
  customStatusId: number | null;
  assigneeIds: number[];
  tags: string[];
};

function useTaskPatch(taskId: number) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const save = useCallback(
    (patch: InlinePatch, options?: { refresh?: boolean }): Promise<boolean> =>
      new Promise((resolve) => {
        const data = new FormData();
        data.set("taskId", String(taskId));
        data.set("patch", JSON.stringify(patch));
        startTransition(async () => {
          const result = await updateTaskInlineAction({ success: false }, data);
          if (!result.success) {
            notify.error("Task not saved", result.error ?? "Update failed", `inline-${taskId}`);
            resolve(false);
            return;
          }
          if (options?.refresh) router.refresh();
          resolve(true);
        });
      }),
    [taskId, router]
  );

  return { save, pending };
}

export function InlineTitle({ task, href = true, scope = "" }: { task: InlineTask; href?: boolean; scope?: string }) {
  const { save, pending } = useTaskPatch(task.id);
  const { openTask } = useTaskDrawer();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  const [lastSaved, setLastSaved] = useState(task.title);

  async function commit() {
    const next = value.trim();
    if (!next) {
      setValue(lastSaved);
      return;
    }
    if (next === lastSaved) return;
    const ok = await save({ title: next });
    if (ok) setLastSaved(next);
    else setValue(lastSaved);
  }

  if (editing) {
    return (
      <div className="flex min-w-0 items-center gap-1 [td_&]:max-w-80">
        <Input
          compact
          autoFocus
          aria-label={`Title for task ${task.id}${scope}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={async () => {
            await commit();
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
            if (event.key === "Escape") {
              setValue(lastSaved);
              setEditing(false);
            }
          }}
          className={cn(
            "min-w-0 flex-1 font-bold",
            pending && "opacity-70"
          )}
        />
        {pending ? <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" /> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1 [td_&]:max-w-80">
      <button
        type="button"
        onClick={() => openTask(task.id)}
        title={value}
        className="h-control-sm min-w-0 flex-1 truncate rounded-lg border border-transparent px-2.5 text-left text-sm font-bold hover:border-border hover:bg-muted focus-visible:border-border focus-visible:bg-card focus-visible:outline-none"
      >
        {value}
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Rename task ${task.title}`}
        title="Rename inline"
        className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3" />
      </button>
      {href ? (
        <a href={`/tasks/${task.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${task.title} in a new tab`} className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

export function InlineStatus({ task, scope = "" }: { task: InlineTask; scope?: string }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState(task.status);
  return (
    <BlockSelect
      compact
      id={`inline-status-${task.id}${scope}`}
      value={value}
      onChange={async (next) => {
        const previous = value;
        setValue(next);
        const ok = await save({ status: next });
        if (!ok) setValue(previous);
      }}
      options={STATUS_OPTIONS}
    />
  );
}

export function InlinePriority({ task, scope = "" }: { task: InlineTask; scope?: string }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState(task.priority);
  return (
    <BlockSelect
      compact
      id={`inline-priority-${task.id}${scope}`}
      value={value}
      onChange={async (next) => {
        const previous = value;
        setValue(next);
        const ok = await save({ priority: next });
        if (!ok) setValue(previous);
      }}
      options={PRIORITY_OPTIONS}
    />
  );
}

export function InlineCustomStatus({ task, options }: { task: InlineTask; options: { id: number; name: string }[] }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState(task.customStatusId ? String(task.customStatusId) : "");
  return (
    <BlockSelect
      compact
      id={`inline-custom-${task.id}`}
      value={value}
      onChange={async (next) => {
        const previous = value;
        setValue(next);
        const ok = await save({ customStatusId: next ? Number(next) : null });
        if (!ok) setValue(previous);
      }}
      options={[{ value: "", label: "No custom status", tone: "paper" }, ...options.map((option) => ({ value: String(option.id), label: option.name, tone: "purple" as const }))]}
    />
  );
}

export function InlineAssignees({ task, members, scope = "" }: { task: InlineTask; members: AssigneeOption[]; scope?: string }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState<number[]>(task.assigneeIds);
  return (
    <div className="min-w-0 [td_&]:w-36">
      <AssigneePicker
        compact
        id={`inline-assignees-${task.id}${scope}`}
        members={members}
        value={value}
        onChange={async (next) => {
          const previous = value;
          setValue(next);
          const ok = await save({ assigneeIds: next });
          if (!ok) setValue(previous);
        }}
      />
    </div>
  );
}

export function InlineQuadrant({ task, scope = "" }: { task: InlineTask; scope?: string }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState(task.quadrant ?? "");
  return (
    <BlockSelect
      compact
      id={`inline-quadrant-${task.id}${scope}`}
      value={value}
      onChange={async (next) => {
        const previous = value;
        setValue(next);
        const ok = await save({ quadrant: next || null });
        if (!ok) setValue(previous);
      }}
      options={QUADRANT_OPTIONS}
    />
  );
}

export function InlineDue({ task, scope = "" }: { task: InlineTask; scope?: string }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState<string | null>(task.dueAt);
  return (
    <div className="min-w-0 [td_&]:min-w-32">
      <DateTimePicker
        compact
        name={`due-${task.id}${scope}`}
        id={`inline-due-${task.id}${scope}`}
        defaultValue={value}
        placeholder="No due date"
        onChange={async (next) => {
          const previous = value;
          setValue(next);
          const ok = await save({ dueAt: next });
          if (!ok) setValue(previous);
        }}
      />
    </div>
  );
}

export function InlineProgress({ task, scope = "" }: { task: InlineTask; scope?: string }) {
  const { save, pending } = useTaskPatch(task.id);
  const [value, setValue] = useState(String(task.progress));
  return (
    <div className="flex items-center gap-1">
      <Input
        compact
        aria-label={`Progress for task ${task.id}${scope}`}
        type="number"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={async () => {
          const next = Math.max(0, Math.min(100, Number(value) || 0));
          setValue(String(next));
          if (next === task.progress) return;
          const ok = await save({ progress: next });
          if (!ok) setValue(String(task.progress));
        }}
        className="w-16"
      />
      <span className="text-xs text-muted-foreground">%</span>
      {pending ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

export function InlineTags({ task, scope = "" }: { task: InlineTask; scope?: string }) {
  const { save } = useTaskPatch(task.id);
  const [tags, setTags] = useState<string[]>(task.tags);
  const [draft, setDraft] = useState("");

  async function commit(next: string[]) {
    const previous = tags;
    setTags(next);
    const ok = await save({ tags: next });
    if (!ok) setTags(previous);
  }

  function add(raw: string) {
    const title = raw.trim().replaceAll(",", "");
    if (!title) return;
    if (tags.some((tag) => tag.toLowerCase() === title.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    void commit([...tags, title]);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 [td_&]:min-w-24">
      {tags.map((tag) => (
        <span key={tag} className="chip chip-cyan !text-[10px]">
          {tag}
          <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => commit(tags.filter((item) => item !== tag))} className="ml-0.5 text-current/70 hover:text-destructive">
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <Input
        compact
        aria-label={`Add tag to task ${task.id}${scope}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => add(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
          }
        }}
        placeholder={tags.length === 0 ? "Add tag" : "+"}
        className="flex-1 basis-24"
      />
    </div>
  );
}

export function InlineProject({ task, projects }: { task: InlineTask; projects: { id: number; name: string; lists: { id: number; name: string }[] }[] }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState(String(task.projectId));
  return (
    <SearchableSelect
      compact
      id={`inline-project-${task.id}`}
      noClear
      value={value}
      onChange={async (next) => {
        const previous = value;
        setValue(next);
        const project = projects.find((item) => String(item.id) === next);
        const ok = await save({ projectId: Number(next), listId: project?.lists[0]?.id ?? task.listId }, { refresh: true });
        if (!ok) setValue(previous);
      }}
      options={projects.map((project) => ({ value: String(project.id), label: project.name }))}
    />
  );
}

export function InlineList({ task, lists }: { task: InlineTask; lists: { id: number; name: string }[] }) {
  const { save } = useTaskPatch(task.id);
  const [value, setValue] = useState(String(task.listId));
  return (
    <SearchableSelect
      compact
      id={`inline-list-${task.id}`}
      noClear
      value={value}
      onChange={async (next) => {
        const previous = value;
        setValue(next);
        const ok = await save({ listId: Number(next) }, { refresh: true });
        if (!ok) setValue(previous);
      }}
      options={lists.map((list) => ({ value: String(list.id), label: list.name }))}
    />
  );
}

export function InlineOpenLink({ task }: { task: InlineTask }) {
  return (
    <Link href={`/tasks/${task.id}`} className="text-[11px] font-bold uppercase text-primary underline">
      Open
    </Link>
  );
}
