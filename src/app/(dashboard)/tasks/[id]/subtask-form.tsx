"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications/client";
import { createTaskAction, type TaskActionState } from "../actions";

export function SubtaskForm({ projectId, listId, parentId }: { projectId: number; listId: number; parentId: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TaskActionState, FormData>(createTaskAction, { success: false });
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) notify.error("Subtask not created", state.error, `subtask-${parentId}`);
    if (state.success) {
      notify.success("Subtask created", undefined, `subtask-${parentId}`);
      ref.current?.reset();
      router.refresh();
    }
  }, [state, parentId, router]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="parentId" value={parentId} />
      <div className="min-w-56 flex-1">
        <Input name="title" required maxLength={500} placeholder="Subtask title" aria-label="Subtask title" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="mr-1.5 size-4" /> {pending ? "Adding…" : "Add subtask"}
      </Button>
    </form>
  );
}
