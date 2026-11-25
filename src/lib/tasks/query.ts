import type { Prisma, Task } from "@/generated/prisma/client";
import type { ListTasksInput } from "./schema";

export type TaskWithRelations = Task & {
  assignees?: { user: { id: number; email: string; fullName: string } }[];
  tags?: { tag: { id: number; title: string } }[];
  customStatus?: { id: number; name: string; color: string } | null;
};

export const TASK_INCLUDE = {
  assignees: { select: { user: { select: { id: true, email: true, fullName: true } } } },
  tags: { select: { tag: { select: { id: true, title: true } } } },
  customStatus: { select: { id: true, name: true, color: true } },
} as const;

export function buildTaskWhere(
  companyId: number,
  input: ListTasksInput,
  options: { memberUserId?: number } = {}
): Prisma.TaskWhereInput {
  const now = new Date();
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const week = new Date(now); week.setDate(week.getDate() + 7);
  return {
    project: {
      group: { companyId },
      ...(options.memberUserId ? { members: { some: { userId: options.memberUserId } } } : {}),
    },
    ...(input.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
    list: { archived: false },
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.listId ? { listId: input.listId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.quadrant ? { quadrant: input.quadrant } : {}),
    ...(input.assigneeId ? { assignees: { some: { userId: input.assigneeId } } } : {}),
    ...(input.q ? {
      OR: [
        { title: { contains: input.q, mode: "insensitive" } },
        { description: { contains: input.q, mode: "insensitive" } },
      ],
    } : {}),
    ...(input.due === "overdue" ? { status: { not: "COMPLETED" }, dueAt: { lt: now } } :
      input.due === "today" ? { dueAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lte: endOfDay } } :
      input.due === "week" ? { dueAt: { gte: now, lte: week } } : {}),
  };
}

export function presentTask(task: TaskWithRelations) {
  return {
    id: task.id,
    projectId: task.projectId,
    listId: task.listId,
    parentId: task.parentId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    quadrant: task.quadrant ?? null,
    progress: task.progress,
    assignees: (task.assignees ?? []).map((a) => ({
      id: a.user.id,
      email: a.user.email,
      fullName: a.user.fullName,
    })),
    tags: (task.tags ?? []).map((t) => ({ id: t.tag.id, title: t.tag.title })),
    customStatus: task.customStatus ?? null,
    customStatusId: task.customStatusId ?? null,
    createdById: task.createdById,
    startAt: task.startAt?.toISOString() ?? null,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    order: task.order,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
