"use client";

import { useActionState, useEffect, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notifications/client";
import { addTaskCommentAction } from "../actions";

type State = { success: boolean; error?: string };

export function CommentForm({ taskId, onAdded }: { taskId: number; onAdded?: () => void }) {
  const [state, action, pending] = useActionState<State, FormData>(addTaskCommentAction, { success: false });
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) notify.error("Comment not added", state.error, "task-comment");
    if (state.success) {
      notify.success("Comment added", "Assignees and tagged people were notified.", "task-comment");
      ref.current?.reset();
      onAdded?.();
    }
  }, [state, onAdded]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <Label htmlFor="body">Add a comment</Label>
      <Textarea id="body" name="body" placeholder="Write a comment. Use @email to tag an assignee." required className="min-h-24" />
      <Button type="submit" disabled={pending}>
        <MessageSquarePlus className="size-4" />
        {pending ? "Adding…" : "Add comment"}
      </Button>
    </form>
  );
}
