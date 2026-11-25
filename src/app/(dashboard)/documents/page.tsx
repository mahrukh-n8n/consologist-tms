import { FileText } from "lucide-react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listDocuments } from "@/lib/documents/query";
import { canSeeAllProjects, projectVisibilityWhere } from "@/lib/projects/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { DocumentButton } from "@/components/documents/document-drawer";
import { createDocumentAction } from "./actions";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { user, company } = await requireCompany();
  const seeAll = await canSeeAllProjects(prisma, user.id, company.id);
  const projectId = Number((await searchParams).projectId) || undefined;
  const [projects, documents] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectVisibilityWhere(company.id, user.id, seeAll), archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listDocuments(prisma, company.id, projectId, seeAll ? undefined : user.id),
  ]);

  return (
    <div className="section-gap">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Project knowledge</p>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle mt-2">Markdown documents with outline navigation, voice notes and attachments.</p>
        </div>
        <span className="chip chip-purple">{documents.length} documents</span>
      </header>

      <Card>
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
      </Card>

      {documents.length === 0 ? (
        <div className="block-card p-10 text-center">
          <p className="font-heading text-xl font-extrabold uppercase">No documents yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one above to start writing.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => (
            <article key={document.id} className="block-card flex flex-col gap-2 p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">{document.project.name}</p>
              <p className="font-heading text-lg font-extrabold">{document.title}</p>
              <p className="text-xs text-muted-foreground">
                v{document.version} · {document.attachments.length} attachments · updated {document.updatedAt.toISOString().slice(0, 10)}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <span className="text-xs text-muted-foreground">{document.contentMarkdown.length.toLocaleString()} chars</span>
                <DocumentButton
                  document={{
                    id: document.id,
                    projectName: document.project.name,
                    title: document.title,
                    contentMarkdown: document.contentMarkdown,
                    version: document.version,
                    attachments: document.attachments.map((attachment) => ({
                      id: attachment.id,
                      kind: attachment.kind,
                      fileName: attachment.fileName,
                      mimeType: attachment.mimeType,
                      size: attachment.size,
                      createdAt: attachment.createdAt.toISOString(),
                    })),
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
