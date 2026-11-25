"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications/client";
import { approveAction, rejectAction, type ApprovalState } from "./actions";

const initial: ApprovalState = { success: false };

export function ApprovalButtons({ id }: { id: number }) {
  const [approve, approveSubmit, approving] = useActionState(approveAction, initial);
  const [reject, rejectSubmit, rejecting] = useActionState(rejectAction, initial);

  useEffect(() => {
    if (approve.error) notify.error("Approval failed", approve.error, `approve-${id}`);
    if (approve.success) notify.success("Request approved", "The executor created the real record.", `approve-${id}`);
  }, [approve, id]);

  useEffect(() => {
    if (reject.error) notify.error("Rejection failed", reject.error, `reject-${id}`);
    if (reject.success) notify.success("Request rejected", "Nothing was created.", `reject-${id}`);
  }, [reject, id]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={approveSubmit}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" disabled={approving}>{approving ? "Approving…" : "Approve"}</Button>
      </form>
      <form action={rejectSubmit} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <Input name="reason" placeholder="Rejection reason" className="h-8 w-48" required />
        <Button type="submit" variant="destructive" size="sm" disabled={rejecting}>
          {rejecting ? "Rejecting…" : "Reject"}
        </Button>
      </form>
    </div>
  );
}
