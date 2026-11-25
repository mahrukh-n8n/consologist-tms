import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { PermissionAuditActionType, type RecordPermissionChangeInput } from "../types/audit-types";

/**
 * Record a permission change in the immutable audit log.
 *
 * MUST be called inside the same transaction as the permission mutation.
 * This is NOT a standalone operation — it receives the tx client from the caller.
 *
 * Fails loud if required fields are missing. Never silently skips.
 * No try/catch: if we cannot write the audit entry, the permission change must not proceed.
 */
export async function recordPermissionChange(
  tx: PrismaClient | Prisma.TransactionClient,
  input: RecordPermissionChangeInput
): Promise<void> {
  // ── Validate required fields ──────────────────────────────
  if (!input.companyId) {
    throw new Error("[PermissionAudit] companyId is required");
  }
  if (!input.actorId) {
    throw new Error("[PermissionAudit] actorId is required");
  }
  if (!input.actionType) {
    throw new Error("[PermissionAudit] actionType is required");
  }
  if (!Object.values(PermissionAuditActionType).includes(input.actionType)) {
    throw new Error(`[PermissionAudit] Invalid actionType: ${input.actionType}`);
  }

  // ── Write the immutable audit entry ───────────────────────
  await (tx as PrismaClient).permissionAuditLog.create({
    data: {
      companyId: input.companyId,
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      actionType: input.actionType,
      beforeState: (input.beforeState ?? undefined) as Prisma.InputJsonValue | undefined,
      afterState: (input.afterState ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
