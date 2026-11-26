import Link from "next/link";
import { notFound } from "next/navigation";
import { listDocumentsSchema } from "@/lib/documents/schema";
import { FileText, CircleHelp } from "lucide-react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { DOCUMENT_PAGE_SIZE, listDocumentRows } from "@/lib/documents/query";
import { canSeeAllProjects, projectVisibilityWhere } from "@/lib/projects/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { AccessLevel, requirePageAccess, getPageApprovalRequired } from "@/modules/auth-rbac/middleware/page-access";
import { ArchiveDocumentButton, DeleteDocumentButton } from "@/components/documents/document-actions";
import { Button } from "@/components/ui/button";
import { DocumentButton } from "@/components/documents/document-drawer";
import { createDocumentAction } from "./actions";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; archived?: string; afterId?: string }>;
}) {
  const { user, company } = await requireCompany();
  const params = await searchParams;
  const filters = listDocumentsSchema.safeParse({ ...params, archived: params.archived === "1" });
  if (!filters.success) notFound();
  const { projectId, afterId, archived = false } = filters.data;
  const [access, needsApproval, seeAll] = await Promise.all([
    requirePageAccess(user.id, company.id, "documents"),
    getPageApprovalRequired(user.id, company.id, "documents"),
    canSeeAllProjects(prisma, user.id, company.id),
  ]);
  const canCreate = access === AccessLevel.READ_WRITE;
  const canManage = canCreate && !needsApproval;
  const [projects, result] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectVisibilityWhere(company.id, user.id, seeAll), archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listDocumentRows(prisma, company.id, { projectId, archived, afterId }, seeAll ? undefined : user.id),
  ]);

  const documents = result.slice(0, DOCUMENT_PAGE_SIZE);
  function href(showArchived: boolean, cursor?: number) {
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", String(projectId));
    if (showArchived) query.set("archived", "1");
    if (cursor) query.set("afterId", String(cursor));
    return query.size ? `/documents?${query}` : "/documents";
  }

  return (
    <div className="section-gap">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Project knowledge</p>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle mt-2">Markdown documents with outline navigation, voice notes and attachments.</p>
        </div>
        <Link href="/htmldocs/documents.html" aria-label="Document help" title="Document help"><CircleHelp className="size-5" /></Link>
      </header>

      {canCreate && !archived && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" /> New document</CardTitle>
          <CardDescription>Create it here, then open it to edit content, record voice notes or attach files.</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a project first.</p>
          ) : (
            <NotifyForm
              action={createDocumentAction}
              actionId="create-document"
              submitLabel="Create document"
              successTitle="Document created"
              errorTitle="Document not created"
              fields={[
                { kind: "select", name: "projectId", label: "Project", required: true, options: projects.map((p) => ({ value: String(p.id), label: p.name })) },
                { kind: "text", name: "title", label: "Title", required: true, placeholder: "e.g. Discovery notes" },
              ]}
            />
          )}
        </CardContent>
      </Card>}

      <section className="space-y-3" aria-label="Document list">
        <nav aria-label="Document status" className="flex flex-wrap gap-2">
          {[false, true].map((showArchived) => (
            <Button key={String(showArchived)} asChild size="sm" variant={showArchived === archived ? "default" : "outline"}>
              <Link href={href(showArchived)} aria-current={showArchived === archived ? "page" : undefined}>{showArchived ? "Archived" : "Active"}</Link>
            </Button>
          ))}
        </nav>
        {documents.length === 0 ? (
          <p className="block-card p-6 text-center text-muted-foreground">
            {afterId ? "No more documents on this page." : archived ? "No archived documents." : "No active documents."}
          </p>
        ) : (
          <ul className="block-card divide-y divide-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="break-words font-bold"><DocumentButton asTitle id={doc.id} title={doc.title} canManage={canManage} /></h2>
                  <p className="text-sm text-muted-foreground">
                    {doc.project.name} · v{doc.version} · {doc._count.attachments} attachments · Updated {doc.updatedAt.toISOString().slice(0, 10)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DocumentButton id={doc.id} title={doc.title} canManage={canManage} />
                  {canManage && <>
                    <ArchiveDocumentButton document={{ id: doc.id, title: doc.title }} archived={archived} />
                    <DeleteDocumentButton document={{ id: doc.id, title: doc.title }} />
                  </>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3 text-sm font-semibold underline">
          {afterId && <Link href={href(archived)}>First page</Link>}
          {result.length > DOCUMENT_PAGE_SIZE && <Link href={href(archived, documents[documents.length - 1]!.id)}>Next page</Link>}
        </div>
      </section>
    </div>
  );
}
