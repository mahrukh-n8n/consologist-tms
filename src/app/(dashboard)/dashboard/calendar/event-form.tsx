"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { notify } from "@/lib/notifications/client";
import { createEventAction } from "./actions";

type State = { success: boolean; error?: string };

export function EventCreateForm({ projects }: { projects: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<State, FormData>(createEventAction, { success: false });
  const [projectId, setProjectId] = useState(String(projects[0]?.id ?? ""));
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error) notify.error("Event not created", state.error, "create-event");
    if (state.success) { notify.success("Event created", "It is on the calendar.", "create-event"); ref.current?.reset(); }
  }, [state]);
  if (projects.length === 0) return <p className="text-sm text-muted-foreground">Create a project first.</p>;
  return (
    <form ref={ref} action={action} className="grid gap-3 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor="create-event-projectId">Project</Label>
        <SearchableSelect id="create-event-projectId" noClear value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: String(p.id), label: p.name }))} />
        <input type="hidden" name="projectId" value={projectId} />
      </div>
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="create-event-title">Title</Label>
        <Input id="create-event-title" name="title" required placeholder="e.g. Sprint review" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-event-startAt">Starts</Label>
        <DateTimePicker id="create-event-startAt" name="startAt" placeholder="Pick start" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="create-event-endAt">Ends</Label>
        <DateTimePicker id="create-event-endAt" name="endAt" placeholder="Optional end" />
      </div>
      <div className="flex items-end lg:col-span-4">
        <Button type="submit" variant="accent" disabled={pending}><CalendarPlus className="size-4" />{pending ? "Adding…" : "Add event"}</Button>
      </div>
    </form>
  );
}
