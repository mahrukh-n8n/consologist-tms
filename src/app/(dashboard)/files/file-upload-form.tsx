"use client";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { notify } from "@/lib/notifications/client";
import { uploadFileAction, type ActionState } from "./actions";
import { useState } from "react";

export function FileUploadForm({ projects }: { projects: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadFileAction, { success: false });
  const [projectId, setProjectId] = useState(String(projects[0]?.id ?? ""));
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error) notify.error("Upload failed", state.error, "file-upload");
    if (state.success) { notify.success("File uploaded", "Stored in Google Drive.", "file-upload"); ref.current?.reset(); }
  }, [state]);
  if (projects.length === 0) return <p className="text-sm text-muted-foreground">Create a project first.</p>;
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="projectId">Project</Label>
        <SearchableSelect id="projectId" noClear value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: String(p.id), label: p.name }))} />
        <input type="hidden" name="projectId" value={projectId} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="file">File</Label>
        <Input id="file" name="file" type="file" required />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
    </form>
  );
}
