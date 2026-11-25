"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications/client";
import { DeleteTaskForm } from "./[id]/task-actions";
import {
  deleteTaskListAction,
  setTaskArchivedAction,
  setTaskListArchivedAction,
  type BulkActionState,
} from "./actions";

type ArchivedTask = { id: number; title: string; projectName: string; listName: string };
type ArchivedList = { id: number; name: string; projectName: string; count: number };

function RestoreTask({ task }: { task: ArchivedTask }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BulkActionState, FormData>(setTaskArchivedAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("Task not restored", state.error, `restore-task-${task.id}`);
    if (state.success) {
      notify.success("Task restored", task.title, `restore-task-${task.id}`);
      router.refresh();
    }
  }, [state, task.id, task.title, router]);
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="archived" value="false" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <ArchiveRestore className="mr-1 size-3.5" /> Restore
      </Button>
    </form>
  );
}

function RestoreList({ list }: { list: ArchivedList }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BulkActionState, FormData>(setTaskListArchivedAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("List not restored", state.error, `restore-list-${list.id}`);
    if (state.success) {
      notify.success("Task list restored", list.name, `restore-list-${list.id}`);
      router.refresh();
    }
  }, [state, list.id, list.name, router]);
  return (
    <form action={action}>
      <input type="hidden" name="listId" value={list.id} />
      <input type="hidden" name="archived" value="false" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <ArchiveRestore className="mr-1 size-3.5" /> Restore
      </Button>
    </form>
  );
}

function DeleteList({ list }: { list: ArchivedList }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BulkActionState, FormData>(deleteTaskListAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("List not deleted", state.error, `delete-list-${list.id}`);
    if (state.success) {
      notify.success("Task list deleted", "An immutable audit snapshot was recorded.", `delete-list-${list.id}`);
      router.refresh();
    }
  }, [state, list.id, router]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="listId" value={list.id} />
      <Input name="reason" required placeholder="Delete reason" aria-label={`Delete reason for ${list.name}`} compact className="w-40" />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        <Trash2 className="mr-1 size-3.5" /> Delete list
      </Button>
    </form>
  );
}

export function ArchivedPanel({ tasks, lists }: { tasks: ArchivedTask[]; lists: ArchivedList[] }) {
  return (
    <div className="space-y-5">
      <section className="block-card p-3">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-sm font-extrabold uppercase">Archived tasks ({tasks.length})</h2>
          <Link href="/tasks" className="text-[11px] font-bold uppercase text-primary underline">Back to board</Link>
        </header>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived tasks.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2 text-sm">
                <div className="min-w-0">
                  <Link href={`/tasks/${task.id}`} className="truncate font-bold underline">{task.title}</Link>
                  <p className="text-[11px] text-muted-foreground">{task.projectName} / {task.listName}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <RestoreTask task={task} />
                  <DeleteTaskForm taskId={task.id} title={task.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block-card p-3">
        <h2 className="mb-2 font-heading text-sm font-extrabold uppercase">Archived task lists ({lists.length})</h2>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived task lists.</p>
        ) : (
          <div className="space-y-2">
            {lists.map((list) => (
              <div key={list.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2 text-sm">
                <div>
                  <p className="font-bold">{list.name}</p>
                  <p className="text-[11px] text-muted-foreground">{list.projectName} · {list.count} tasks</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <RestoreList list={list} />
                  <DeleteList list={list} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
