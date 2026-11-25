import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listFiles } from "@/lib/files/service";
import { canSeeAllProjects, projectVisibilityWhere } from "@/lib/projects/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "./file-upload-form";

export default async function FilesPage() {
  const { user, company } = await requireCompany();
  const seeAll = await canSeeAllProjects(prisma, user.id, company.id);
  const [projects, files] = await Promise.all([
    prisma.project.findMany({ where: { ...projectVisibilityWhere(company.id, user.id, seeAll), archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listFiles(prisma, company.id, undefined, seeAll ? undefined : user.id),
  ]);
  return (
    <div className="section-gap">
      <h1 className="page-title">Files</h1>
      <Card><CardHeader><CardTitle>Upload</CardTitle></CardHeader><CardContent><FileUploadForm projects={projects} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Files ({files.length})</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {files.length === 0 ? <p className="text-muted-foreground">No files.</p> : files.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <span><a className="text-primary underline" href={f.webViewLink} target="_blank" rel="noreferrer">{f.name}</a> · {f.project.name}</span>
            <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
