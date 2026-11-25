"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import {
  executeRestoreAction,
  previewRestoreAction,
  type RestoreState,
} from "./actions";

const initial: RestoreState = { success: false };

export function RestoreForm({ backupId }: { backupId: number }) {
  const [password, setPassword] = useState("");
  const [preview, previewAction, previewing] = useActionState(previewRestoreAction, initial);
  const [restore, restoreAction, restoring] = useActionState(executeRestoreAction, initial);

  useEffect(() => {
    if (preview.error) notify.error("Preview failed", preview.error, "restore-preview");
    if (preview.success) notify.info("Preview ready", "Review the counts before restoring.", "restore-preview");
  }, [preview]);

  useEffect(() => {
    if (restore.error) notify.error("Restore failed", restore.error, "restore-execute");
    if (restore.success) notify.success("Restore completed", "Workspace data was replaced.", "restore-execute");
  }, [restore]);

  return (
    <div className="space-y-2 rounded-xl border-2 border-ink bg-card p-3 shadow-[3px_3px_0_var(--ink)]">
      <div className="space-y-1">
        <Label htmlFor={`restore-password-${backupId}`}>Backup password</Label>
        <Input
          id={`restore-password-${backupId}`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={previewAction}>
          <input type="hidden" name="id" value={backupId} />
          <input type="hidden" name="password" value={password} />
          <Button id={`preview-${backupId}`} type="submit" variant="outline" size="sm" disabled={previewing || !password}>
            {previewing ? "Checking…" : "Preview restore"}
          </Button>
        </form>

        <form action={restoreAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={backupId} />
          <input type="hidden" name="password" value={password} />
          <Input id={`confirm-${backupId}`} name="confirm" placeholder="Type RESTORE" compact className="w-36" />
          <Button id={`execute-${backupId}`} type="submit" variant="destructive" size="sm" disabled={restoring || !password}>
            {restoring ? "Restoring…" : "Restore"}
          </Button>
        </form>
      </div>

      {preview.preview ? (
        <div className="rounded-xl border-2 border-ink bg-muted p-2 text-xs">
          <p>Sources: {preview.preview.sourceCount} · Rows: {preview.preview.rowCount}</p>
          {preview.preview.missingSources.length > 0 ? (
            <p className="text-destructive">Missing: {preview.preview.missingSources.join(", ")}</p>
          ) : null}
          {preview.preview.extraSources.length > 0 ? (
            <p className="text-muted-foreground">Extra: {preview.preview.extraSources.join(", ")}</p>
          ) : null}
          {preview.preview.warnings.length > 0 ? (
            <ul className="list-disc pl-4 text-muted-foreground">
              {preview.preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
