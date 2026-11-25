"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import { attachTagAction, deleteCommentAction, deleteTaskAction, type ActionState } from "./actions";

export function TagForm({ taskId, onAdded }: { taskId: number; onAdded?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(attachTagAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("Tag not added", state.error, "task-tag");
    if (state.success) {
      notify.success("Tag added", undefined, "task-tag");
      onAdded?.();
    }
  }, [state, onAdded]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="tags">Add tags</Label>
        <TagInput id="tags" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add tags"}</Button>
    </form>
  );
}

export function DeleteTaskForm({ taskId, title }: { taskId: number; title: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteTaskAction, { success: false });
  const router = useRouter();
  useEffect(() => {
    if (state.error) notify.error("Task not deleted", state.error, "task-delete");
    if (state.success) {
      notify.success("Task deleted", "An immutable deletion audit was recorded.", "task-delete");
      router.push("/tasks");
    }
  }, [state, router]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="space-y-1">
        <Label htmlFor="reason">Delete “{title}”</Label>
        <Input id="reason" name="reason" placeholder="Reason (required)" required />
      </div>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>{pending ? "Deleting…" : "Delete task"}</Button>
    </form>
  );
}


export function DeleteCommentForm({ commentId, taskId, onDeleted }: { commentId: number; taskId: number; onDeleted?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteCommentAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("Comment not deleted", state.error, `delete-comment-${commentId}`);
    if (state.success) {
      notify.success("Comment deleted", "An immutable deletion audit was recorded.", `delete-comment-${commentId}`);
      onDeleted?.();
    }
  }, [state, commentId, onDeleted]);
  return (
    <form action={action} className="mt-1 flex flex-wrap items-end gap-2">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Input id={`comment-reason-${commentId}`} name="reason" placeholder="Delete reason" className="h-7 w-40 text-xs" required />
      <Button id={`delete-comment-${commentId}`} type="submit" variant="ghost" size="sm" disabled={pending}>{pending ? "Deleting…" : "Delete comment"}</Button>
    </form>
  );
}
