import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listDiscussions } from "@/lib/discussions/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { MarkdownView } from "@/components/documents/markdown-view";
import { createDiscussionAction } from "./actions";

export default async function DiscussionsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { company } = await requireCompany();
  const projectId = Number((await searchParams).projectId) || undefined;
  const [projects, discussions] = await Promise.all([
    prisma.project.findMany({ where: { group: { companyId: company.id }, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listDiscussions(prisma, company.id, projectId),
  ]);
  return (
    <div className="section-gap">
      <h1 className="page-title">Discussions</h1>
      <Card><CardHeader><CardTitle>New discussion</CardTitle></CardHeader><CardContent>
        {projects.length === 0 ? <p className="text-sm text-muted-foreground">Create a project first.</p> : (
          <NotifyForm action={createDiscussionAction} actionId="create-discussion" submitLabel="Add discussion" successTitle="Discussion created" errorTitle="Discussion not created"
            className="space-y-3"
            fields={[
              { kind: "select", name: "projectId", label: "Project", required: true, options: projects.map((p) => ({ value: String(p.id), label: p.name })) },
              { kind: "text", name: "title", label: "Title", required: true },
              { kind: "markdown", name: "body", label: "Body", placeholder: "Write the discussion — headings, lists, links" },
            ]} />
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Recent ({discussions.length})</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {discussions.length === 0 ? <p className="text-muted-foreground">No discussions.</p> : discussions.map((d) => (
          <div key={d.id} className="rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <p className="font-medium">{d.title}</p>
            <p className="text-xs text-muted-foreground">{d.project.name} · {d.createdAt.toISOString().slice(0,10)}</p>
            {d.body ? <MarkdownView markdown={d.body} className="mt-1 text-muted-foreground" /> : null}
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
