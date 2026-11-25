"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications/client";
import { deleteTaskFileAction, uploadTaskFileAction, type TaskFileState } from "./file-actions";

type TaskFile = {
  id: number;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string;
  createdAt: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RemoveFileButton({ taskId, fileId, name, onChanged }: { taskId: number; fileId: number; name: string; onChanged?: () => void }) {
  const [state, action, pending] = useActionState<TaskFileState, FormData>(deleteTaskFileAction, { success: false });
  useEffect(() => {
    if (state.error) notify.error("Remove failed", state.error, `task-file-remove-${fileId}`);
    if (state.success) {
      notify.success("Attachment removed", "The Drive copy was kept.", `task-file-remove-${fileId}`);
      onChanged?.();
    }
  }, [state, fileId, onChanged]);
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="fileId" value={fileId} />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove attachment ${name}`}
        title="Remove from task"
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}

export function TaskFiles({
  taskId,
  files,
  driveConnected,
  onChanged,
}: {
  taskId: number;
  files: TaskFile[];
  driveConnected: boolean;
  onChanged?: () => void;
}) {
  const [state, action, pending] = useActionState<TaskFileState, FormData>(uploadTaskFileAction, { success: false });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) notify.error("Upload failed", state.error, "task-file-upload");
    if (state.success) {
      notify.success("File uploaded", "Stored in Google Drive.", "task-file-upload");
      formRef.current?.reset();
      onChanged?.();
    }
  }, [state, onChanged]);

  return (
    <div className="space-y-3">
      {driveConnected ? (
        <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <Input ref={inputRef} name="file" type="file" required className="max-w-xs" aria-label="Attach a file" />
          <Button type="submit" size="sm" disabled={pending}>
            <Paperclip className="mr-1.5 size-4" />
            {pending ? "Uploading…" : "Attach"}
          </Button>
          <span className="text-xs text-muted-foreground">Uploads to Google Drive · max 10 MB</span>
        </form>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-ink p-4 text-sm">
          <p className="font-extrabold uppercase">Google Drive not connected</p>
          <p className="mt-1 text-muted-foreground">Task attachments are stored in Google Drive. Connect it to enable uploads.</p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/manage-system/drive">Connect Google Drive</Link>
          </Button>
        </div>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-card px-3 py-2 shadow-[2px_2px_0_var(--ink)]"
            >
              <a
                href={file.webViewLink}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-sm font-bold text-primary underline"
              >
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{file.name}</span>
              </a>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
                <RemoveFileButton taskId={taskId} fileId={file.id} name={file.name} onChanged={onChanged} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
