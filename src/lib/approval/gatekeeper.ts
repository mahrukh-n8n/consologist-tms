import type { PrismaClient } from "@/generated/prisma/client";
import { approvalHandler } from "./executor";

type Db = PrismaClient;

export async function approvePendingApproval(
  db: Db,
  input: { approvalId: number; companyId: number; reviewerId: number }
) {
  const pending = await db.pendingApproval.findFirst({
    where: { id: input.approvalId, companyId: input.companyId, status: "PENDING" },
  });
  if (!pending) throw new Error("Approval request not found or already reviewed.");
  if (pending.submittedBy === input.reviewerId) {
    throw new Error("You cannot approve your own request.");
  }

  const handler = approvalHandler(pending.entityType);
  if (!handler) throw new Error(`No executor is registered for "${pending.entityType}".`);

  const execution = await handler(
    db,
    pending.payload as Record<string, unknown>,
    pending.submittedBy,
    input.companyId
  );

  return db.pendingApproval.update({
    where: { id: pending.id },
    data: {
      status: "APPROVED",
      entityId: execution.entityId,
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
    },
  });
}

export async function rejectPendingApproval(
  db: Db,
  input: { approvalId: number; companyId: number; reviewerId: number; reason: string }
) {
  if (!input.reason.trim()) throw new Error("A rejection reason is required.");
  const result = await db.pendingApproval.updateMany({
    where: { id: input.approvalId, companyId: input.companyId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
      rejectionReason: input.reason.trim(),
    },
  });
  if (result.count !== 1) throw new Error("Approval request not found or already reviewed.");
}
