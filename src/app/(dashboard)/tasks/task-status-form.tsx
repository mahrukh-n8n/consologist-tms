"use client";

import { useState } from "react";
import { BlockSelect } from "@/components/ui/block-select";
import { updateTaskStatusAction } from "./actions";

const STATUSES = [
  { value: "NO_PROGRESS", label: "No Progress", tone: "paper" as const },
  { value: "IN_PROGRESS", label: "In Progress", tone: "cyan" as const },
  { value: "COMPLETED", label: "Completed", tone: "lime" as const },
];

export function TaskStatusForm({ taskId, status }: { taskId: number; status: string }) {
  const [value, setValue] = useState(status);
  return (
    <form action={updateTaskStatusAction} className="flex items-center gap-1.5">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={value} />
      <BlockSelect id={`status-${taskId}`} value={value} onChange={setValue} options={STATUSES} className="w-40" />
      <button type="submit" className="text-xs font-extrabold uppercase underline">Save</button>
    </form>
  );
}
