import Link from "next/link";
import { FolderOpen, Layers, Plus } from "lucide-react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listGroups } from "@/lib/projects/service";
import { canSeeAllProjects } from "@/lib/projects/access";
import { listAddableMembers, listProjectMembers } from "@/lib/projects/members";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { MarkdownView } from "@/components/documents/markdown-view";
import { ProjectMembers } from "./project-members";
import { createGroupAction, createProjectAction } from "./actions";

const ACCENTS = ["accent-lime", "accent-cyan", "accent-pink", "accent-orange", "accent-purple", "accent-sun"];

export default async function ProjectsPage() {
  const { user, company } = await requireCompany();
  const seeAll = await canSeeAllProjects(prisma, user.id, company.id);
  const groups = await listGroups(prisma, company.id, seeAll ? undefined : user.id);
  const projectCount = groups.reduce((sum, group) => sum + group.projects.length, 0);
  const memberData = new Map<number, { members: Awaited<ReturnType<typeof listProjectMembers>>; addable: Awaited<ReturnType<typeof listAddableMembers>> }>();
  if (seeAll) {
    for (const group of groups) {
      for (const project of group.projects) {
        memberData.set(project.id, {
          members: await listProjectMembers(prisma, company.id, project.id),
          addable: await listAddableMembers(prisma, company.id, project.id),
        });
      }
    }
  }

  return (
    <div className="section-gap">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Structure</p>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle mt-2">Groups hold projects. Projects hold tasks, documents and files.</p>
        </div>
        <div className="flex gap-2">
          <span className="chip chip-purple">{groups.length} groups</span>
          <span className="chip chip-lime">{projectCount} projects</span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Layers className="size-5 text-primary" /> New group</CardTitle>
            <CardDescription>A group is the folder above projects.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <NotifyForm
              action={createGroupAction}
              actionId="create-group"
              submitLabel="Create group"
              successTitle="Group created"
              errorTitle="Group not created"
              fields={[{ kind: "text", name: "name", label: "Group name", required: true, placeholder: "e.g. Client Delivery" }]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="size-5 text-primary" /> New project</CardTitle>
            <CardDescription>Adds a starter task list and the core apps.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create a group first.</p>
            ) : (
              <NotifyForm
                action={createProjectAction}
                actionId="create-project"
                submitLabel="Create project"
                successTitle="Project created"
                errorTitle="Project not created"
                className="grid gap-3 sm:grid-cols-2"
                fields={[
                  { kind: "select", name: "groupId", label: "Group", required: true, options: groups.map((g) => ({ value: String(g.id), label: g.name })) },
                  { kind: "text", name: "name", label: "Project name", required: true, placeholder: "e.g. Website relaunch" },
                  { kind: "text", name: "description", label: "Description", className: "sm:col-span-2 space-y-1" },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="font-heading text-2xl font-extrabold uppercase">Groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-ink bg-card p-10 text-center shadow-[6px_6px_0_var(--ink)]">
            <p className="font-heading text-xl font-extrabold uppercase">No groups yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first group above.</p>
          </div>
        ) : groups.map((group, index) => (
          <Card key={group.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><FolderOpen className="size-5" /> {group.name}</CardTitle>
              <span className="chip chip-paper">{group.projects.length} projects</span>
            </CardHeader>
            <CardContent className="pt-4">
              {group.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects in this group.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.projects.map((project, projectIndex) => (
                    <article key={project.id} className="overflow-hidden rounded-xl border-2 border-ink bg-card shadow-[4px_4px_0_var(--ink)]">
                      <div className={`h-2 border-b-2 border-ink ${ACCENTS[(index + projectIndex) % ACCENTS.length]}`} />
                      <div className="p-3">
                        <p className="font-heading text-sm font-extrabold uppercase">{project.name}</p>
                        {project.description ? <MarkdownView markdown={project.description} className="mt-1 line-clamp-2 text-xs text-muted-foreground" /> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                          <Link className="underline" href={`/tasks?projectId=${project.id}`}>Tasks</Link>
                          <Link className="underline" href={`/documents?projectId=${project.id}`}>Documents</Link>
                          <Link className="underline" href={`/files?projectId=${project.id}`}>Files</Link>
                          {memberData.get(project.id) ? (
                            <ProjectMembers
                              projectId={project.id}
                              projectName={project.name}
                              members={memberData.get(project.id)!.members.map((member) => ({
                                userId: member.userId,
                                name: member.user.fullName,
                                email: member.user.email,
                                role: member.role,
                                isOwner: member.userId === project.ownerId,
                              }))}
                              addable={memberData.get(project.id)!.addable.map((candidate) => ({
                                id: candidate.id,
                                name: candidate.fullName,
                                email: candidate.email,
                              }))}
                            />
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
