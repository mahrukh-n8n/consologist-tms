import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listTags } from "@/lib/tasks/tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { deleteTagAction, renameTagAction } from "./actions";

export default async function TagsPage() {
  const { company } = await requireCompany();
  const tags = await listTags(prisma, company.id);
  return (
    <div className="section-gap">
      <h1 className="page-title">Tags</h1>
      <Card><CardHeader><CardTitle>Tags ({tags.length})</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {tags.length === 0 ? <p className="text-muted-foreground">No tags yet. Add tags while creating a task.</p> : tags.map((tag) => (
          <div key={tag.id} className="rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <div className="flex items-center justify-between gap-2">
              <span>{tag.title} · {tag._count.tasks} tasks</span>
              <form action={deleteTagAction}>
                <input type="hidden" name="tagId" value={tag.id} />
                <Button type="submit" variant="ghost" size="sm">Delete</Button>
              </form>
            </div>
            <NotifyForm action={renameTagAction} actionId={`rename-tag-${tag.id}`} submitLabel="Rename" successTitle="Tag renamed" errorTitle="Rename failed"
              className="mt-2 flex flex-wrap items-end gap-2"
              fields={[
                { kind: "hidden", name: "tagId", defaultValue: String(tag.id) },
                { kind: "text", name: "title", label: "New title", required: true, defaultValue: tag.title },
              ]} />
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
