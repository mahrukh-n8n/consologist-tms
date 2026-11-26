import type { PrismaClient, Comment } from "@/generated/prisma/client";
import type { AddCommentInput } from "@/lib/tasks/schema";
import { assertProjectComment } from "@/lib/projects/access";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Single gatekeeper for task comments. */
export async function gkCreateComment(
  tx: Tx,
  companyId: number,
  userId: number,
  input: AddCommentInput
): Promise<Comment> {
  const task = await tx.task.findFirst({
    where: { id: input.taskId, project: { group: { companyId } } },
    select: { id: true, projectId: true },
  });
  if (!task) throw new Error("Task not found in this workspace.");
  await assertProjectComment(tx, companyId, userId, task.projectId);

  return tx.comment.create({
    data: {
      projectId: task.projectId,
      itemType: "task",
      itemId: task.id,
      userId,
      body: input.body,
    },
  });
}
