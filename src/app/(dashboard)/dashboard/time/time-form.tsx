"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { notify } from "@/lib/notifications/client";
import { createTimeAction } from "./actions";

type State = { success: boolean; error?: string };

export function TimeCreateForm({ projects }: { projects: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<State, FormData>(createTimeAction, { success: false });
  const [projectId, setProjectId] = useState(String(projects[0]?.id ?? ""));
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error) notify.error("Time not logged", state.error, "create-time");
    if (state.success) { notify.success("Time logged", undefined, "create-time"); ref.current?.reset(); }
  }, [state]);
  if (projects.length === 0) return <p className="text-sm text-muted-foreground">Create a project first.</p>;
  return (
    <form ref={ref} action={action} className="grid gap-3 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor="create-time-projectId">Project</Label>
        <SearchableSelect id="create-time-projectId" noClear value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: String(p.id), label: p.name }))} />
        <input type="hidden" name="projectId" value={projectId} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-time-date">Date</Label>
        <DateTimePicker id="create-time-date" name="date" dateOnly placeholder="Pick a date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-time-minutes">Minutes</Label>
        <Input id="create-time-minutes" name="minutes" type="number" min={1} max="1440" required placeholder="45" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-time-description">Description</Label>
        <Input id="create-time-description" name="description" placeholder="What did you work on?" />
      </div>
      <div className="lg:col-span-4">
        <Button type="submit" variant="accent" disabled={pending}><Clock className="size-4" />{pending ? "Logging…" : "Add record"}</Button>
      </div>
    </form>
  );
}
