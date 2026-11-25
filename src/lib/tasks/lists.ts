import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const createTaskListSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(100),
});
export const renameTaskListSchema = z.object({
  listId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(100),
});
export const archiveTaskListSchema = z.object({
  listId: z.coerce.number().int().positive(),
  archived: z.coerce.boolean().default(true),
});
export const deleteTaskListSchema = z.object({
  listId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1, "A deletion reason is required.").max(500),
});

export function listTaskLists(
  db: Db,
  companyId: number,
  projectId?: number,
  memberUserId?: number,
  archived = false
) {
  return db.taskList.findMany({
    where: {
      archived,
      project: {
        group: { companyId },
        ...(projectId ? { id: projectId } : {}),
        ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
      },
    },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: [{ project: { name: "asc" } }, { order: "asc" }],
  });
}

export async function gkCreateTaskList(
  db: Db,
  companyId: number,
  userId: number,
  input: z.infer<typeof createTaskListSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");

  const duplicate = await db.taskList.findFirst({
    where: { projectId: input.projectId, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("A list with that name already exists in this project.");

  const last = await db.taskList.findFirst({
    where: { projectId: input.projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return db.taskList.create({
    data: { projectId: input.projectId, name: input.name, order: (last?.order ?? 0) + 100 },
  });
}

export async function renameTaskList(
  db: Db,
  companyId: number,
  input: z.infer<typeof renameTaskListSchema>
) {
  const list = await db.taskList.findFirst({
    where: { id: input.listId, project: { group: { companyId } } },
    select: { id: true, projectId: true },
  });
  if (!list) throw new Error("Task list not found in this workspace.");
  const duplicate = await db.taskList.findFirst({
    where: { projectId: list.projectId, name: { equals: input.name, mode: "insensitive" }, id: { not: list.id } },
    select: { id: true },
  });
  if (duplicate) throw new Error("A list with that name already exists in this project.");
  return db.taskList.update({ where: { id: list.id }, data: { name: input.name } });
}

export async function archiveTaskList(
  db: Db,
  companyId: number,
  input: z.infer<typeof archiveTaskListSchema>
) {
  const list = await db.taskList.findFirst({
    where: { id: input.listId, project: { group: { companyId } } },
    select: { id: true },
  });
  if (!list) throw new Error("Task list not found in this workspace.");
  return db.taskList.update({ where: { id: list.id }, data: { archived: input.archived } });
}

/** Audited list deletion. Snapshot includes the list and every task it holds. */
export async function deleteTaskListWithAudit(
  db: Db,
  input: { companyId: number; actorId: number; listId: number; reason: string }
) {
  if (!input.reason.trim()) throw new Error("A deletion reason is required.");
  return db.$transaction(async (tx) => {
    const list = await tx.taskList.findFirst({
      where: { id: input.listId, project: { group: { companyId: input.companyId } } },
      include: {
        project: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true, title: true, description: true, status: true, priority: true,
            quadrant: true, progress: true, parentId: true, dueAt: true, createdAt: true,
          },
        },
      },
    });
    if (!list) throw new Error("Task list not found in this workspace.");
    if (list.project.id && (await tx.taskList.count({ where: { projectId: list.projectId } })) <= 1) {
      throw new Error("A project needs at least one task list.");
    }
    const audit = await tx.deletionAudit.create({
      data: {
        companyId: input.companyId,
        actorId: input.actorId,
        entityType: "TaskList",
        entityId: list.id,
        reason: input.reason.trim(),
        snapshot: {
          list: { id: list.id, name: list.name, projectId: list.projectId, projectName: list.project.name, archived: list.archived },
          tasks: list.tasks,
        },
      },
    });
    await tx.taskList.delete({ where: { id: list.id } });
    return audit;
  });
}
