"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { inviteUserAction, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUserAction, {
    success: false,
  });
  const [role, setRole] = useState("WRITE");

  useEffect(() => {
    if (state.error) notify.error("Invitation not sent", state.error, "invite");
    if (state.success) notify.success("Invitation sent", "The invitee can set a password from the link.", "invite");
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="role">Role</Label>
        <SearchableSelect
          id="role"
          noClear
          className="w-40"
          value={role}
          onChange={setRole}
          options={[
            { value: "READ_ONLY", label: "Read only" },
            { value: "COMMENT", label: "Comment" },
            { value: "WRITE", label: "Write" },
            { value: "DELETE", label: "Delete" },
            { value: "ADMIN", label: "Admin" },
          ]}
        />
        <input type="hidden" name="role" value={role} />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Invite user"}</Button>
    </form>
  );
}
