"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import { deleteSavedFilterAction, saveTaskFilterAction, type SavedFilterState } from "./actions";

type Option = { value: string; label: string };

export function TaskFilters({
  view,
  projects,
  assignees,
  current,
  savedFilters,
}: {
  view: string;
  projects: { id: number; name: string; lists: { id: number; name: string }[] }[];
  assignees: { id: number; fullName: string; email: string }[];
  current: {
    q: string;
    projectId: string;
    listId: string;
    status: string;
    priority: string;
    quadrant: string;
    assigneeId: string;
    due: string;
  };
  savedFilters: { id: number; title: string; filter: Record<string, string> }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(current.q);
  const [projectId, setProjectId] = useState(current.projectId);
  const [listId, setListId] = useState(current.listId);
  const [status, setStatus] = useState(current.status);
  const [priority, setPriority] = useState(current.priority);
  const [quadrant, setQuadrant] = useState(current.quadrant);
  const [assigneeId, setAssigneeId] = useState(current.assigneeId);
  const [due, setDue] = useState(current.due);
  const [savedId, setSavedId] = useState("");
  const [filterName, setFilterName] = useState("");
  const [saveState, saveAction, saving] = useActionState<SavedFilterState, FormData>(saveTaskFilterAction, { success: false });

  useEffect(() => {
    if (saveState.error) notify.error("Filter not saved", saveState.error, "task-filter-save");
    if (saveState.success) notify.success("Filter saved", filterName || undefined, "task-filter-save");
  }, [saveState, filterName]);

  function currentFilter(): Record<string, string> {
    const values: Record<string, string> = { q, projectId, listId, status, priority, quadrant, assigneeId, due };
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
  }

  function applySaved(id: string) {
    setSavedId(id);
    const saved = savedFilters.find((entry) => String(entry.id) === id);
    if (!saved) return;
    const params = new URLSearchParams({ view });
    for (const [key, value] of Object.entries(saved.filter)) if (value) params.set(key, value);
    router.push(`/tasks?${params.toString()}`);
  }

  const selectedProject = projects.find((project) => String(project.id) === projectId);
  const listOptions: Option[] = [
    { value: "", label: "All lists" },
    ...(selectedProject?.lists ?? projects.flatMap((project) => project.lists)).map((list) => ({
      value: String(list.id),
      label: selectedProject ? list.name : `${projects.find((p) => p.lists.some((l) => l.id === list.id))?.name ?? ""} / ${list.name}`,
    })),
  ];

  function apply() {
    const params = new URLSearchParams();
    params.set("view", view);
    if (q.trim()) params.set("q", q.trim());
    if (projectId) params.set("projectId", projectId);
    if (listId) params.set("listId", listId);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (quadrant) params.set("quadrant", quadrant);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (due) params.set("due", due);
    router.push(`/tasks?${params.toString()}`);
  }

  function reset() {
    setQ(""); setProjectId(""); setListId(""); setStatus(""); setPriority(""); setQuadrant(""); setAssigneeId(""); setDue("");
    router.push(`/tasks?view=${view}`);
  }

  const active = [q, projectId, listId, status, priority, quadrant, assigneeId, due].filter(Boolean).length;

  return (
    <div className="block-card p-3">
      <div className="mb-3 flex flex-wrap items-end gap-2 border-b border-border pb-3">
        <div className="w-52 space-y-1">
          <Label htmlFor="filter-saved">Saved filters</Label>
          <SearchableSelect
            id="filter-saved"
            value={savedId}
            onChange={applySaved}
            options={[{ value: "", label: savedFilters.length ? "Choose a saved filter" : "No saved filters" }, ...savedFilters.map((entry) => ({ value: String(entry.id), label: entry.title }))]}
          />
        </div>
        {savedId ? (
          <form action={deleteSavedFilterAction}>
            <input type="hidden" name="savedFilterId" value={savedId} />
            <Button type="submit" variant="outline" size="sm">Delete saved</Button>
          </form>
        ) : null}
        <form action={saveAction} className="flex flex-1 flex-wrap items-end gap-2">
          <input type="hidden" name="filter" value={JSON.stringify(currentFilter())} />
          <div className="min-w-40 flex-1 space-y-1">
            <Label htmlFor="filter-save-name">Save current filters as</Label>
            <Input id="filter-save-name" name="title" value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="e.g. My overdue tasks" />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={saving || !filterName.trim()}>
            {saving ? "Saving…" : "Save filter"}
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="filter-q">Search</Label>
          <Input id="filter-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Title or description" onKeyDown={(event) => { if (event.key === "Enter") apply(); }} />
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="filter-project">Project</Label>
          <SearchableSelect id="filter-project" value={projectId} onChange={(value) => { setProjectId(value); setListId(""); }} options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]} />
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="filter-list">List</Label>
          <SearchableSelect id="filter-list" value={listId} onChange={setListId} options={listOptions} />
        </div>
        <div className="w-36 space-y-1">
          <Label htmlFor="filter-status">Status</Label>
          <SearchableSelect id="filter-status" value={status} onChange={setStatus} options={[
            { value: "", label: "Any" }, { value: "NO_PROGRESS", label: "No Progress" },
            { value: "IN_PROGRESS", label: "In Progress" }, { value: "COMPLETED", label: "Completed" },
          ]} />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="filter-priority">Priority</Label>
          <SearchableSelect id="filter-priority" value={priority} onChange={setPriority} options={[
            { value: "", label: "Any" }, { value: "NONE", label: "None" }, { value: "LOW", label: "Low" },
            { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" },
          ]} />
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="filter-quadrant">Quadrant</Label>
          <SearchableSelect id="filter-quadrant" value={quadrant} onChange={setQuadrant} options={[
            { value: "", label: "Any" },
            { value: "DO_FIRST", label: "Do first" },
            { value: "SCHEDULE", label: "Schedule" },
            { value: "DELEGATE", label: "Delegate" },
            { value: "ELIMINATE", label: "Eliminate" },
          ]} />
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="filter-assignee">Assignee</Label>
          <SearchableSelect id="filter-assignee" value={assigneeId} onChange={setAssigneeId} options={[
            { value: "", label: "Anyone" },
            ...assignees.map((user) => ({ value: String(user.id), label: `${user.fullName} <${user.email}>` })),
          ]} />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="filter-due">Due</Label>
          <SearchableSelect id="filter-due" value={due} onChange={setDue} options={[
            { value: "", label: "Any" }, { value: "overdue", label: "Overdue" },
            { value: "today", label: "Today" }, { value: "week", label: "Next 7 days" },
          ]} />
        </div>
        <Button type="button" id="filter-apply" onClick={apply}><Filter className="size-4" /> Apply{active ? ` (${active})` : ""}</Button>
        <Button type="button" id="filter-reset" variant="outline" onClick={reset}><RotateCcw className="size-4" /> Reset</Button>
      </div>
    </div>
  );
}
