import type { PrismaClient, Task } from "@/generated/prisma/client";
import type { ArchiveTaskInput, BulkTaskActionInput, CreateTaskInput, UpdateTaskDetailsInput, UpdateTaskStatusInput } from "@/lib/tasks/schema";
import { TaskStatus } from "@/generated/prisma/enums";
import { assertProjectMember } from "@/lib/projects/access";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Single gatekeeper for task creation. Used by GUI and MCP.
 * Enforces project/list/assignee/tag/date invariants and owns all writes.
 */
export async function gkCreateTask(
  tx: Tx,
  companyId: number,
  userId: number,
  input: CreateTaskInput
): Promise<Task> {
  const project = await tx.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  await assertProjectMember(tx, companyId, userId, input.projectId);

  const list = await tx.taskList.findFirst({
    where: { id: input.listId, projectId: input.projectId },
    select: { id: true },
  });
  if (!list) throw new Error("Task list does not belong to this project.");

  if (input.parentId) {
    const parent = await tx.task.findFirst({
      where: { id: input.parentId, projectId: input.projectId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent task does not belong to this project.");
  }

  if (input.startAt && input.dueAt && new Date(input.startAt) > new Date(input.dueAt)) {
    throw new Error("Start date cannot be after the due date.");
  }

  const assigneeIds = [...new Set(input.assigneeIds)];
  if (input.customStatusId) {
    const status = await tx.customStatus.findFirst({
      where: { id: input.customStatusId, companyId, archived: false },
      select: { id: true },
    });
    if (!status) throw new Error("Custom status not found in this workspace.");
  }
  if (assigneeIds.length > 0) {
    const members = await tx.projectMember.findMany({
      where: { projectId: input.projectId, userId: { in: assigneeIds } },
      select: { userId: true },
    });
    if (members.length !== assigneeIds.length) {
      throw new Error("Every assignee must be a member of this project.");
    }
  }

  const last = await tx.task.findFirst({
    where: { listId: input.listId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const task = await tx.task.create({
    data: {
      projectId: input.projectId,
      listId: input.listId,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description,
      priority: input.priority,
      quadrant: input.quadrant ?? null,
      status: input.status,
      progress: input.status === TaskStatus.COMPLETED ? 100 : 0,
      completedAt: input.status === TaskStatus.COMPLETED ? new Date() : null,
      createdById: userId,
      customStatusId: input.customStatusId ?? null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      order: (last?.order ?? 0) + 1000,
    },
  });

  if (assigneeIds.length > 0) {
    await tx.taskAssignee.createMany({
      data: assigneeIds.map((assigneeId) => ({ taskId: task.id, userId: assigneeId })),
    });
  }

  const titles = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  for (const title of titles) {
    const tag = await tx.tag.upsert({
      where: { companyId_title: { companyId, title } },
      update: {},
      create: { companyId, title, ownerId: userId },
    });
    await tx.taskTag.create({ data: { taskId: task.id, tagId: tag.id } });
  }

  return task;
}

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.NO_PROGRESS]: [TaskStatus.NO_PROGRESS, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.NO_PROGRESS, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED],
  [TaskStatus.COMPLETED]: [TaskStatus.NO_PROGRESS, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED],
};

export async function gkUpdateTaskStatus(
  tx: Tx,
  companyId: number,
  actorId: number,
  input: UpdateTaskStatusInput
): Promise<Task> {
  const task = await tx.task.findFirst({
    where: { id: input.taskId, project: { group: { companyId } } },
    select: { id: true, status: true, projectId: true },
  });
  if (!task) throw new Error("Task not found in this workspace.");
  await assertProjectMember(tx, companyId, actorId, task.projectId);
  if (!ALLOWED_TRANSITIONS[task.status].includes(input.status)) {
    throw new Error(`Invalid status transition ${task.status} → ${input.status}.`);
  }

  const updated = await tx.task.update({
    where: { id: input.taskId },
    data: {
      status: input.status,
      progress: input.status === TaskStatus.COMPLETED ? 100 : 0,
      completedAt: input.status === TaskStatus.COMPLETED ? new Date() : null,
    },
  });

  await tx.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "tasks",
      recordId: task.id,
      action: "STATUS_CHANGE",
      oldValues: { status: task.status },
      newValues: { status: input.status },
      changedFields: ["status"],
    },
  });

  return updated;
}


/** Full task edit used by GUI list/board/table/detail and MCP. */
/**
 * Description-only update. Full-detail edits keep using gkUpdateTaskDetails.
 * Description is capped at the same limit as the full update schema.
 */
export async function gkUpdateTaskDescription(
  tx: Tx,
  companyId: number,
  actorId: number,
  input: { taskId: number; description: string }
): Promise<Task> {
  const task = await tx.task.findFirst({
    where: { id: input.taskId, project: { group: { companyId } } },
    select: { id: true, description: true },
  });
  if (!task) throw new Error("Task not found in this workspace.");
  const description = input.description ?? "";
  if (description.length > 100_000) throw new Error("Description is limited to 100,000 characters.");

  const updated = await tx.task.update({
    where: { id: task.id },
    data: { description },
  });

  await tx.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "tasks",
      recordId: task.id,
      action: "UPDATE",
      oldValues: { description: task.description },
      newValues: { description },
      changedFields: ["description"],
    },
  });

  return updated;
}

export async function gkUpdateTaskDetails(
  tx: Tx,
  companyId: number,
  actorId: number,
  input: UpdateTaskDetailsInput
): Promise<Task> {
  const task = await tx.task.findFirst({
    where: { id: input.taskId, project: { group: { companyId } } },
    select: { id: true, projectId: true, listId: true, status: true, title: true },
  });
  if (!task) throw new Error("Task not found in this workspace.");
  await assertProjectMember(tx, companyId, actorId, task.projectId);

  const project = await tx.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  await assertProjectMember(tx, companyId, actorId, input.projectId);

  const list = await tx.taskList.findFirst({
    where: { id: input.listId, projectId: input.projectId, archived: false },
    select: { id: true },
  });
  if (!list) throw new Error("Task list does not belong to this project.");

  const assigneeIds = [...new Set(input.assigneeIds)];
  if (assigneeIds.length > 0) {
    const members = await tx.projectMember.findMany({
      where: { projectId: input.projectId, userId: { in: assigneeIds } },
      select: { userId: true },
    });
    if (members.length !== assigneeIds.length) throw new Error("Every assignee must be a member of the project.");
  }

  if (input.parentId) {
    if (input.parentId === task.id) throw new Error("A task cannot be its own parent.");
    const parent = await tx.task.findFirst({
      where: { id: input.parentId, projectId: input.projectId, archivedAt: null },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent task must be an active task in the same project.");
    let cursor: number | null = parent.id;
    while (cursor) {
      const row: { parentId: number | null } | null = await tx.task.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = row?.parentId ?? null;
      if (cursor === task.id) throw new Error("Cannot move a task under its own subtask.");
    }
  }

  if (input.customStatusId) {
    const status = await tx.customStatus.findFirst({
      where: { id: input.customStatusId, companyId, archived: false },
      select: { id: true },
    });
    if (!status) throw new Error("Custom status not found in this workspace.");
  }

  if (!ALLOWED_TRANSITIONS[task.status].includes(input.status)) {
    throw new Error(`Invalid status transition ${task.status} → ${input.status}.`);
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("A valid due date is required.");

  const updated = await tx.task.update({
    where: { id: task.id },
    data: {
      projectId: input.projectId,
      listId: input.listId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      quadrant: input.quadrant ?? null,
      parentId: input.parentId ?? null,
      progress: input.progress ?? (input.status === TaskStatus.COMPLETED ? 100 : 0),
      completedAt: input.status === TaskStatus.COMPLETED ? new Date() : null,
      dueAt,
      customStatusId: input.customStatusId ?? null,
    },
  });

  await tx.taskAssignee.deleteMany({ where: { taskId: task.id } });
  if (assigneeIds.length > 0) {
    await tx.taskAssignee.createMany({ data: assigneeIds.map((userId) => ({ taskId: task.id, userId })) });
  }

  const titles = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  const existing = await tx.taskTag.findMany({ where: { taskId: task.id }, include: { tag: true } });
  const keep = new Set(titles.map((title) => title.toLowerCase()));
  const toRemove = existing.filter((link) => !keep.has(link.tag.title.toLowerCase())).map((link) => link.tagId);
  if (toRemove.length > 0) await tx.taskTag.deleteMany({ where: { taskId: task.id, tagId: { in: toRemove } } });
  for (const title of titles) {
    const tag = await tx.tag.upsert({
      where: { companyId_title: { companyId, title } },
      update: {},
      create: { companyId, title, ownerId: actorId },
    });
    await tx.taskTag.upsert({
      where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
      update: {},
      create: { taskId: task.id, tagId: tag.id },
    });
  }

  await tx.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "tasks",
      recordId: task.id,
      action: "UPDATE",
      oldValues: { title: task.title, status: task.status, projectId: task.projectId, listId: task.listId },
      newValues: { title: updated.title, status: updated.status, projectId: updated.projectId, listId: updated.listId },
      changedFields: ["title", "description", "status", "priority", "dueAt", "customStatusId", "assignees", "tags", "projectId", "listId"],
    },
  });

  return updated;
}


/** Archive or restore a task and its whole subtask subtree. */
export async function gkSetTaskArchived(
  tx: Tx,
  companyId: number,
  actorId: number,
  input: ArchiveTaskInput
): Promise<{ updated: number }> {
  const task = await tx.task.findFirst({
    where: { id: input.taskId, project: { group: { companyId } } },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found in this workspace.");

  const ids = new Set<number>([task.id]);
  let frontier = [task.id];
  while (frontier.length > 0) {
    const children = await tx.task.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id).filter((id) => !ids.has(id));
    for (const id of frontier) ids.add(id);
  }

  await tx.task.updateMany({
    where: { id: { in: [...ids] } },
    data: { archivedAt: input.archived ? new Date() : null },
  });
  await tx.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "tasks",
      recordId: task.id,
      action: input.archived ? "ARCHIVE" : "RESTORE",
      newValues: { archived: input.archived, taskIds: [...ids] },
    },
  });
  return { updated: ids.size };
}

/** Collect a task plus every descendant id. */
async function collectSubtreeIds(tx: Tx, roots: number[]): Promise<Set<number>> {
  const ids = new Set<number>(roots);
  let frontier = [...roots];
  while (frontier.length > 0) {
    const children = await tx.task.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id).filter((id) => !ids.has(id));
    for (const id of frontier) ids.add(id);
  }
  return ids;
}

/**
 * Bulk archive / unarchive / move. Used by the GUI selection bar and MCP.
 * Every task must be visible to the actor; moves validate list, parent and cycles.
 */
export async function gkBulkUpdateTasks(
  tx: Tx,
  companyId: number,
  actorId: number,
  input: BulkTaskActionInput
): Promise<{ updated: number }> {
  const ids = [...new Set(input.taskIds)];
  const tasks = await tx.task.findMany({
    where: { id: { in: ids }, project: { group: { companyId } } },
    select: { id: true, projectId: true, listId: true, parentId: true },
  });
  if (tasks.length !== ids.length) throw new Error("Some selected tasks were not found in this workspace.");
  for (const projectId of new Set(tasks.map((task) => task.projectId))) {
    await assertProjectMember(tx, companyId, actorId, projectId);
  }

  if (input.action === "archive" || input.action === "unarchive") {
    const subtree = await collectSubtreeIds(tx, ids);
    await tx.task.updateMany({
      where: { id: { in: [...subtree] } },
      data: { archivedAt: input.action === "archive" ? new Date() : null },
    });
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actorId,
        tableName: "tasks",
        recordId: ids[0] ?? 0,
        action: input.action === "archive" ? "BULK_ARCHIVE" : "BULK_RESTORE",
        newValues: { taskIds: ids, affected: [...subtree] },
      },
    });
    return { updated: subtree.size };
  }

  // move
  if (!input.listId && input.parentId === undefined) throw new Error("Choose a target list or parent task.");
  const selected = new Set(ids);
  for (const task of tasks) {
    if (input.listId) {
      const list = await tx.taskList.findFirst({
        where: { id: input.listId, projectId: task.projectId, archived: false },
        select: { id: true },
      });
      if (!list) throw new Error("Target list does not belong to the task's project.");
    }
    if (input.parentId) {
      if (input.parentId === task.id) throw new Error("A task cannot be its own parent.");
      if (selected.has(input.parentId)) throw new Error("A task cannot be moved under another selected task.");
      const parent = await tx.task.findFirst({
        where: { id: input.parentId, projectId: task.projectId, archivedAt: null },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent task must be an active task in the same project.");
      let cursor: number | null = parent.id;
      while (cursor) {
        const row: { parentId: number | null } | null = await tx.task.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = row?.parentId ?? null;
        if (cursor === task.id) throw new Error("Cannot move a task under its own subtask.");
      }
    }
    await tx.task.update({
      where: { id: task.id },
      data: {
        ...(input.listId ? { listId: input.listId } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      },
    });
  }
  await tx.auditLog.create({
    data: {
      companyId,
      userId: actorId,
      tableName: "tasks",
      recordId: ids[0] ?? 0,
      action: "BULK_MOVE",
      newValues: { taskIds: ids, listId: input.listId ?? null, parentId: input.parentId ?? null },
    },
  });
  return { updated: tasks.length };
}
