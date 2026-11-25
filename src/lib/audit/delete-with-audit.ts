import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

/** Audited task deletion. Snapshot, audit and removal commit atomically. */
export async function deleteTaskWithAudit(
  db: Db,
  input: { companyId: number; actorId: number; taskId: number; reason: string }
) {
  if (!input.reason.trim()) throw new Error("A deletion reason is required.");
  return db.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: input.taskId, project: { group: { companyId: input.companyId } } },
      include: {
        assignees: true,
        tags: true,
        customStatus: true,
        project: { select: { id: true, name: true } },
      },
    });
    if (!task) throw new Error("Task not found in this workspace.");
    const comments = await tx.comment.findMany({ where: { itemType: "task", itemId: task.id } });
    const timeRecords = await tx.timeRecord.findMany({ where: { linkItemType: "task", linkItemId: task.id } });

    const audit = await tx.deletionAudit.create({
      data: {
        companyId: input.companyId,
        actorId: input.actorId,
        entityType: "Task",
        entityId: task.id,
        reason: input.reason.trim(),
        snapshot: { task, comments, timeRecords },
      },
    });

    await tx.comment.deleteMany({ where: { itemType: "task", itemId: task.id } });
    await tx.task.delete({ where: { id: task.id } });
    return audit;
  });
}

/** Audited comment deletion. */
export async function deleteCommentWithAudit(
  db: Db,
  input: { companyId: number; actorId: number; commentId: number; reason: string }
) {
  if (!input.reason.trim()) throw new Error("A deletion reason is required.");
  return db.$transaction(async (tx) => {
    const projectIds = (await tx.project.findMany({
      where: { group: { companyId: input.companyId } },
      select: { id: true },
    })).map((p) => p.id);
    const comment = await tx.comment.findFirst({
      where: { id: input.commentId, projectId: { in: projectIds } },
    });
    if (!comment) throw new Error("Comment not found in this workspace.");
    const audit = await tx.deletionAudit.create({
      data: {
        companyId: input.companyId,
        actorId: input.actorId,
        entityType: "Comment",
        entityId: comment.id,
        reason: input.reason.trim(),
        snapshot: { comment },
      },
    });
    await tx.comment.delete({ where: { id: comment.id } });
    return audit;
  });
}
