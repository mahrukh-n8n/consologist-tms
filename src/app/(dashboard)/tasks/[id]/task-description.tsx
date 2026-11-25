"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownField } from "@/components/documents/markdown-field";
import { MarkdownView } from "@/components/documents/markdown-view";
import { notify } from "@/lib/notifications/client";
import { updateTaskDescriptionAction } from "./actions";

function SaveDescriptionButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Save className="mr-1.5 size-4" />
      {pending ? "Saving…" : "Save description"}
    </Button>
  );
}

export function TaskDescription({
  taskId,
  description,
  onSaved,
}: {
  taskId: number;
  description: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const noticeId = `task-description-${taskId}`;

  async function handleSubmit(formData: FormData) {
    const result = await updateTaskDescriptionAction({ success: false }, formData);
    if (result.error) {
      notify.error("Description not saved", result.error, noticeId);
      return;
    }
    notify.success("Description saved", undefined, noticeId);
    setEditing(false);
    router.refresh();
    onSaved?.();
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {description.trim() ? (
          <MarkdownView markdown={description} />
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}
        <Button id="task-description-edit" type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="mr-1.5 size-4" />
          {description.trim() ? "Edit description" : "Add description"}
        </Button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <MarkdownField name="description" defaultValue={description} placeholder="Describe the task…" minHeight={220} />
      <div className="flex flex-wrap gap-2">
        <SaveDescriptionButton />
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
