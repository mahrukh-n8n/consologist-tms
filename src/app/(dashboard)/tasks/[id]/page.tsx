import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { presentTask, TASK_INCLUDE } from "@/lib/tasks/query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentForm } from "./comment-form";
import { TaskEditButton } from "../task-editor";
import { TaskInlineEditor } from "./inline-editor";
import { listCustomStatuses } from "@/lib/tasks/custom-statuses";
import { MarkdownView } from "@/components/documents/markdown-view";
import { TagForm, DeleteTaskForm, DeleteCommentForm } from "./task-actions";
import { detachTagAction } from "./actions";
import { TaskFiles } from "./task-files";
import { TaskDescription } from "./task-description";
import { SubtaskForm } from "./subtask-form";
import { ArchiveTaskButton } from "./archive-task-button";
import { listTaskFiles } from "@/lib/files/service";
import { isConnected } from "@/modules/google-drive";
import { assertProjectMember } from "@/lib/projects/access";

const PRIORITY_TONE: Record<string, string> = {
  NONE: "chip-paper",
  LOW: "chip-cyan",
  MEDIUM: "chip-sun",
  HIGH: "chip-pink",
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) notFound();

  const { user, company } = await requireCompany();
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { group: { companyId: company.id } } },
    include: { ...TASK_INCLUDE, project: { select: { name: true } } },
  });
  if (!task) notFound();
  await assertProjectMember(prisma, company.id, user.id, task.projectId).catch(() => notFound());

  const [parent, children, projectTasks] = await Promise.all([
    task.parentId
      ? prisma.task.findFirst({ where: { id: task.parentId }, select: { id: true, title: true } })
      : Promise.resolve(null),
    prisma.task.findMany({
      where: { parentId: task.id, archivedAt: null },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { projectId: task.projectId, archivedAt: null, id: { not: task.id } },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const [projects, customStatuses] = await Promise.all([
    prisma.project.findMany({
      where: { group: { companyId: company.id }, archivedAt: null },
      select: {
        id: true, name: true,
        taskLists: { where: { archived: false }, select: { id: true, name: true }, orderBy: { order: "asc" } },
        members: { select: { user: { select: { id: true, fullName: true, email: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    listCustomStatuses(prisma, company.id),
  ]);

  const [comments, files, driveConnected] = await Promise.all([
    prisma.comment.findMany({
      where: { itemType: "task", itemId: taskId },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listTaskFiles(prisma, company.id, taskId),
    isConnected(prisma, company.id),
  ]);
  const row = presentTask(task);

  return (
    <div className="section-gap">
      <div>
        <Link className="inline-flex items-center gap-1 text-sm font-extrabold uppercase underline" href="/tasks">
          <ArrowLeft className="size-4" /> Tasks
        </Link>
        <p className="eyebrow mt-4 text-primary">{task.project.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="page-title">{row.title}</h1>
          <TaskEditButton
            compact={false}
            task={{ id: row.id, projectId: task.projectId, listId: task.listId, title: row.title, description: row.description, status: row.status, priority: row.priority, quadrant: row.quadrant, parentId: task.parentId, dueAt: row.dueAt, customStatusId: row.customStatusId, assigneeIds: row.assignees.map((assignee) => assignee.id), tags: row.tags.map((tag) => tag.title) }}
            projects={projects.map((project) => ({ id: project.id, name: project.name, lists: project.taskLists, members: project.members.map((member) => member.user) }))}
            customStatuses={customStatuses.map((status) => ({ id: status.id, name: status.name }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip chip-purple">{row.status.replaceAll("_", " ")}</span>
          <span className={`chip ${PRIORITY_TONE[row.priority] ?? "chip-paper"}`}>{row.priority}</span>
          {row.customStatus ? <span className="chip chip-sun">{row.customStatus.name}</span> : null}
          {row.dueAt ? <span className="chip chip-cyan">Due {row.dueAt.slice(0, 10)}</span> : null}
          {parent ? <Link href={`/tasks/${parent.id}`} className="chip chip-purple">Parent: {parent.title}</Link> : null}
          <span className="chip chip-paper" title="Created">Created {task.createdAt.toISOString().slice(0, 10)}</span>
          <span className="chip chip-paper" title="Last updated">Updated {task.updatedAt.toISOString().slice(0, 10)}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <TaskDescription taskId={taskId} description={row.description} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <TaskInlineEditor
                task={{ id: row.id, projectId: task.projectId, listId: task.listId, title: row.title, description: row.description, status: row.status, priority: row.priority, quadrant: row.quadrant, parentId: task.parentId, dueAt: row.dueAt, customStatusId: row.customStatusId, assigneeIds: row.assignees.map((assignee) => assignee.id), tags: row.tags.map((tag) => tag.title) }}
                progress={task.progress}
                projects={projects.map((project) => ({ id: project.id, name: project.name, lists: project.taskLists, members: project.members.map((member) => member.user) }))}
                customStatuses={customStatuses.map((status) => ({ id: status.id, name: status.name }))}
                parentOptions={projectTasks}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Subtasks ({children.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-4">
              {children.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subtasks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {children.map((child) => (
                    <li key={child.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2 text-sm shadow-[2px_2px_0_var(--ink)]">
                      <Link href={`/tasks/${child.id}`} className="min-w-0 truncate font-bold underline">{child.title}</Link>
                      <span className="chip chip-paper shrink-0">{child.status.replaceAll("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
              <SubtaskForm projectId={task.projectId} listId={task.listId} parentId={task.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comments ({comments.length})</CardTitle></CardHeader>
            <CardContent className="space-y-5 pt-4">
              <CommentForm taskId={taskId} />
              <div className="space-y-3">
                {comments.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-ink p-5 text-center text-sm text-muted-foreground">No comments yet. Start the thread.</p>
                ) : comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border-2 border-ink bg-card p-3 shadow-[3px_3px_0_var(--ink)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-extrabold">{comment.user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{comment.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
                    </div>
                    <MarkdownView markdown={comment.body} className="mt-1 text-muted-foreground" />
                    <DeleteCommentForm commentId={comment.id} taskId={taskId} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap gap-1.5">
                {row.tags.length === 0 ? <span className="text-sm text-muted-foreground">No tags.</span> : row.tags.map((tag) => (
                  <span key={tag.id} className="chip chip-cyan">
                    {tag.title}
                    <form action={detachTagAction} className="inline">
                      <input type="hidden" name="taskId" value={row.id} />
                      <input type="hidden" name="tagId" value={tag.id} />
                      <button type="submit" aria-label={`Remove tag ${tag.title}`} className="text-ink/70 hover:text-destructive">×</button>
                    </form>
                  </span>
                ))}
              </div>
              <TagForm taskId={taskId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Attachments ({files.length})</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <TaskFiles
                taskId={taskId}
                driveConnected={driveConnected}
                files={files.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Danger zone</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-4">
              <ArchiveTaskButton taskId={taskId} archived={Boolean(task.archivedAt)} />
              <DeleteTaskForm taskId={taskId} title={row.title} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
