"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications/client";
import { setTaskArchivedAction, type BulkActionState } from "../actions";

export function ArchiveTaskButton({ taskId, archived }: { taskId: number; archived: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BulkActionState, FormData>(setTaskArchivedAction, { success: false });

  useEffect(() => {
    if (state.error) notify.error("Task not archived", state.error, `archive-task-${taskId}`);
    if (state.success) {
      notify.success(archived ? "Task restored" : "Task archived", undefined, `archive-task-${taskId}`);
      router.push("/tasks?archived=1");
      router.refresh();
    }
  }, [state, taskId, archived, router]);

  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Archive className="mr-1.5 size-4" />
        {pending ? "Working…" : archived ? "Restore task" : "Archive task"}
      </Button>
    </form>
  );
}
