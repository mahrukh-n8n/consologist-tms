"use client";

import { useActionState, useEffect } from "react";
import { Archive, Trash2 } from "lucide-react";
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
      <button
        id={`archive-list-${listId}`}
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        <Archive className="size-3.5" /> {pending ? "Archiving…" : "Archive"}
      </button>
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
    <form action={action} className="flex flex-wrap items-end gap-1">
      <input type="hidden" name="listId" value={listId} />
      <input name="reason" required placeholder="Delete reason" aria-label={`Delete reason for ${name}`} className="h-7 w-36 rounded-md border border-border bg-card px-2 text-xs" />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" /> {pending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
