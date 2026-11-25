"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import { createStatusAction, type StatusState } from "./actions";

export function StatusForm() {
  const [state, action, pending] = useActionState<StatusState, FormData>(createStatusAction, {
    success: false,
  });
  useEffect(() => {
    if (state.error) notify.error("Status not created", state.error, "custom-status");
    if (state.success) notify.success("Status created", undefined, "custom-status");
  }, [state]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required maxLength={50} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="color">Color</Label>
        <Input id="color" name="color" type="color" defaultValue="#4a86f7" className="h-10 w-16 p-1" />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create status"}</Button>
    </form>
  );
}
