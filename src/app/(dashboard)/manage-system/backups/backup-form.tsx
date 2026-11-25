"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import { createBackupAction, type BackupActionState } from "./actions";

export function BackupForm() {
  const [state, action, pending] = useActionState<BackupActionState, FormData>(createBackupAction, {
    success: false,
  });

  useEffect(() => {
    if (state.error) notify.error("Backup not created", state.error, "backup-create");
    if (state.success) notify.success("Backup created", "Encrypted and stored.", "backup-create");
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="password">Backup password</Label>
        <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create backup"}</Button>
    </form>
  );
}
