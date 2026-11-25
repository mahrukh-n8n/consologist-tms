import type { PrismaClient } from "@/generated/prisma/client";
import type { AddCommentInput } from "./schema";
import { gkCreateComment } from "@/lib/mutations/comments";
import { notifyTaskComment } from "@/lib/notifications/email-alerts";

/** Shared orchestration for GUI and MCP: gatekeeper + post-commit alerts. */
export async function createTaskComment(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: AddCommentInput
) {
  const comment = await db.$transaction((tx) => gkCreateComment(tx, companyId, userId, input));
  await notifyTaskComment(db, comment.id);
  return comment;
}
