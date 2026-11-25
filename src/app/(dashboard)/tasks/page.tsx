import Link from "next/link";
import { Grid2x2, LayoutGrid, List, Table2 } from "lucide-react";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { buildTaskWhere, TASK_INCLUDE } from "@/lib/tasks/query";
import { listTasksSchema } from "@/lib/tasks/schema";
import { canSeeAllProjects, projectVisibilityWhere } from "@/lib/projects/access";
import { listSavedFilters } from "@/lib/tasks/saved-filters";
import { listCustomStatuses } from "@/lib/tasks/custom-statuses";
import { listTaskLists } from "@/lib/tasks/lists";
import { TaskListView, type TaskGroup } from "./task-list-view";
import { TaskBoard } from "./board";
import { TaskTable, type TaskTableRow } from "./task-table";
import { TaskMatrix, type MatrixRow } from "./task-matrix";
import { ArchivedPanel } from "./archived-panel";
import { TasksToolbar } from "./tasks-toolbar";
import { TaskDrawerProvider } from "./task-drawer";
import type { TaskProjectOption } from "./task-editor";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    projectId?: string; listId?: string; view?: string; q?: string;
    status?: string; priority?: string; quadrant?: string; assigneeId?: string; due?: string; archived?: string;
  }>;
}) {
  const { user, company } = await requireCompany();
  const seeAll = await canSeeAllProjects(prisma, user.id, company.id);
  const projectScope = projectVisibilityWhere(company.id, user.id, seeAll);
  const query = await searchParams;
  const archivedView = query.archived === "1";
  const view =
    query.view === "board" ? "board" :
    query.view === "table" ? "table" :
    query.view === "matrix" ? "matrix" : "list";
  const projectId = Number(query.projectId) || undefined;
  const listId = Number(query.listId) || undefined;
  const filters = {
    q: query.q ?? "",
    projectId: query.projectId ?? "",
    listId: query.listId ?? "",
    status: query.status ?? "",
    priority: query.priority ?? "",
    quadrant: query.quadrant ?? "",
    assigneeId: query.assigneeId ?? "",
    due: query.due ?? "",
  };

  const [projects, taskLists, customStatuses, savedFilters] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectScope, archivedAt: null },
      select: {
        id: true,
        name: true,
        taskLists: { where: { archived: false }, select: { id: true, name: true }, orderBy: { order: "asc" } },
        members: { select: { user: { select: { id: true, fullName: true, email: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    listTaskLists(prisma, company.id, projectId, seeAll ? undefined : user.id),
    listCustomStatuses(prisma, company.id),
    listSavedFilters(prisma, user.id),
  ]);

  const taskProjectOptions: TaskProjectOption[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    lists: project.taskLists.map((list) => ({ id: list.id, name: list.name })),
    members: project.members.map((member) => member.user),
  }));

  const input = listTasksSchema.parse({
    page: 1,
    pageSize: 500,
    projectId,
    listId,
    q: query.q || undefined,
    status: query.status || undefined,
    priority: query.priority || undefined,
    quadrant: query.quadrant || undefined,
    archived: archivedView ? true : undefined,
    assigneeId: query.assigneeId || undefined,
    due: query.due || undefined,
  });

  const tasks = await prisma.task.findMany({
    where: buildTaskWhere(company.id, input, seeAll ? {} : { memberUserId: user.id }),
    include: { ...TASK_INCLUDE, list: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    orderBy: [{ project: { name: "asc" } }, { listId: "asc" }, { order: "asc" }],
    take: input.pageSize,
  });

  const archivedLists = archivedView
    ? await listTaskLists(prisma, company.id, projectId, seeAll ? undefined : user.id, true)
    : [];

  const visibleLists = archivedView ? [] : taskLists.filter((list) => !listId || list.id === listId);
  const groups: TaskGroup[] = visibleLists.map((list) => ({
    listId: list.id,
    listName: list.name,
    projectName: list.project.name,
    tasks: tasks.filter((task) => task.listId === list.id),
  }));
  for (const task of tasks) {
    if (groups.some((group) => group.listId === task.listId)) continue;
    groups.push({ listId: task.listId, listName: task.list.name, projectName: task.project.name, tasks: [task] });
  }
  groups.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.listName.localeCompare(b.listName));

  const matrixRows: MatrixRow[] = tasks.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    listId: task.listId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    quadrant: task.quadrant ?? null,
    dueAt: task.dueAt?.toISOString() ?? null,
    progress: task.progress,
    customStatusId: task.customStatusId ?? null,
    assigneeIds: (task.assignees ?? []).map((assignment) => assignment.user.id),
    tags: (task.tags ?? []).map(({ tag }) => tag.title),
    projectName: task.project.name,
    listName: task.list.name,
  }));

  const tableRows: TaskTableRow[] = tasks.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    listId: task.listId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    quadrant: task.quadrant ?? null,
    dueAt: task.dueAt?.toISOString() ?? null,
    progress: task.progress,
    customStatusId: task.customStatusId ?? null,
    assigneeIds: (task.assignees ?? []).map((assignment) => assignment.user.id),
    tags: (task.tags ?? []).map(({ tag }) => tag.title),
    projectName: task.project.name,
    listName: task.list.name,
    assignees: (task.assignees ?? []).map((assignment) => assignment.user),
    tags_detail: (task.tags ?? []).map(({ tag }) => ({ id: tag.id, title: tag.title })),
    customStatus: task.customStatus ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));

  const assigneeOptions = [...new Map(
    projects.flatMap((project) => project.members.map((member) => [member.user.id, member.user] as const))
  ).values()];

  const viewHref = (next: string) => {
    const params = new URLSearchParams({ view: next });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return `/tasks?${params.toString()}`;
  };

  const openCount = tasks.filter((task) => task.status !== "COMPLETED").length;

  return (
    <TaskDrawerProvider
      projects={taskProjectOptions}
      customStatuses={customStatuses.map((status) => ({ id: status.id, name: status.name }))}
    >
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Work board</p>
          <h1 className="page-title">Tasks</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            {[
              { key: "list", label: "List", icon: List },
              { key: "board", label: "Board", icon: LayoutGrid },
              { key: "table", label: "Table", icon: Table2 },
              { key: "matrix", label: "Matrix", icon: Grid2x2 },
            ].map((item) => (
              <Link
                key={item.key}
                href={viewHref(item.key)}
                aria-current={view === item.key ? "page" : undefined}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase ${view === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <item.icon className="size-3.5" /> {item.label}
              </Link>
            ))}
          </div>
          <span className="chip chip-purple">{tasks.length} total</span>
          <span className="chip chip-cyan">{openCount} open</span>
          <span className="chip chip-lime">{tasks.length - openCount} done</span>
          <Link href={archivedView ? "/tasks" : "/tasks?archived=1"} className="chip chip-paper font-bold uppercase">
            {archivedView ? "Back to board" : "Archived"}
          </Link>
        </div>
      </header>

      {archivedView ? (
        <ArchivedPanel
          tasks={tasks.map((task) => ({ id: task.id, title: task.title, projectName: task.project.name, listName: task.list.name }))}
          lists={archivedLists.map((list) => ({ id: list.id, name: list.name, projectName: list.project.name, count: list._count.tasks }))}
        />
      ) : (
      <>
      <TasksToolbar
        view={view}
        projects={taskProjectOptions}
        customStatuses={customStatuses.map((status) => ({ id: status.id, name: status.name }))}
        filters={filters}
        assignees={assigneeOptions.map((user) => ({ id: user.id, fullName: user.fullName, email: user.email }))}
        lists={taskLists.map((list) => ({ id: list.id, name: list.name, projectName: list.project.name, count: list._count.tasks }))}
        savedFilters={savedFilters.map((saved) => ({ id: saved.id, title: saved.title, filter: saved.filter as Record<string, string> }))}
      />

      {view === "board" ? (
        <TaskBoard tasks={tasks} projects={taskProjectOptions} />
      ) : view === "matrix" ? (
        <TaskMatrix rows={matrixRows} projects={taskProjectOptions} />
      ) : view === "table" ? (
        tableRows.length === 0 ? (
          <div className="block-card p-10 text-center">
            <p className="font-heading text-xl font-extrabold uppercase">No matching tasks</p>
            <p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p>
          </div>
        ) : (
          <TaskTable rows={tableRows} projects={taskProjectOptions} customStatuses={customStatuses.map((status) => ({ id: status.id, name: status.name }))} />
        )
      ) : (
        <TaskListView groups={groups} projects={taskProjectOptions} lists={taskLists.map((list) => ({ id: list.id, name: list.name, projectName: list.project.name }))} />
      )}
      </>
      )}
    </div>
    </TaskDrawerProvider>
  );
}
