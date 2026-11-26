"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications/client";
import { removeWorkspaceMemberAction, type RemoveMemberState } from "./actions";

export function RemoveMemberButton({ userId, name }: { userId: number; name: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<RemoveMemberState, FormData>(removeWorkspaceMemberAction, { success: false });

  useEffect(() => {
    if (state.error) notify.error("Member not removed", state.error, `remove-member-${userId}`);
    if (state.success) {
      notify.success("Member removed", `${name} no longer has workspace access.`, `remove-member-${userId}`);
      router.refresh();
    }
  }, [state, userId, name, router]);

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={`Remove ${name} from workspace`}>
        <UserMinus className="mr-1 size-3.5" /> {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}
