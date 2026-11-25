"use client";

import { useActionState, useEffect } from "react";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications/client";
import { archiveTaskListAction, deleteTaskListAction, type BulkActionState, type ListActionState } from "./actions";

export function ArchiveListButton({ listId, name }: { listId: number; name: string }) {
  const [state, action, pending] = useActionState<ListActionState, FormData>(archiveTaskListAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("List not archived", state.error, `archive-list-${listId}`);
    if (state.success) notify.success("List archived", name, `archive-list-${listId}`);
  }, [state, listId, name]);
  return (
    <form action={action}>
      <input type="hidden" name="listId" value={listId} />
      <Button
        size="sm"
        variant="ghost"
        id={`archive-list-${listId}`}
        type="submit"
        disabled={pending}
      >
        <Archive className="size-3.5" /> {pending ? "Archiving…" : "Archive"}
      </Button>
    </form>
  );
}

export function DeleteListButton({ listId, name }: { listId: number; name: string }) {
  const [state, action, pending] = useActionState<BulkActionState, FormData>(deleteTaskListAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("List not deleted", state.error, `delete-list-${listId}`);
    if (state.success) notify.success("List deleted", "An immutable audit snapshot was recorded.", `delete-list-${listId}`);
  }, [state, listId]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="listId" value={listId} />
      <Input compact name="reason" required placeholder="Delete reason" aria-label={`Delete reason for ${name}`} className="w-36" />
      <Button
        size="sm"
        variant="ghost"
        type="submit"
        disabled={pending}
        className="text-destructive"
      >
        <Trash2 className="size-3.5" /> {pending ? "Deleting…" : "Delete"}
      </Button>
    </form>
  );
}
