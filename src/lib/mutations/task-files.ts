import type { PrismaClient as Db } from "@/generated/prisma/client";
import { assertProjectWrite } from "@/lib/projects/access";

/**
 * Task file gatekeeper.
 *
 * Uploads go through `uploadTaskFile` in `src/lib/files/service.ts` (Drive write + metadata).
 * This module owns the only delete path for a task attachment.
 *
 * The Drive object is left in place; only the workspace metadata row is removed.
 */
export async function gkDeleteTaskFile(db: Db, companyId: number, userId: number, fileId: number) {
  const file = await db.fileRecord.findFirst({
    where: {
      id: fileId,
      itemType: "task",
      project: { group: { companyId } },
    },
    select: { id: true, projectId: true },
  });
  if (!file) throw new Error("Attachment not found in this workspace.");
  await assertProjectWrite(db, companyId, userId, file.projectId);
  await db.fileRecord.delete({ where: { id: file.id } });
  await db.auditLog.create({
    data: {
      companyId,
      userId,
      tableName: "files",
      recordId: file.id,
      action: "DELETE",
      oldValues: { itemType: "task", note: "Drive object retained." },
    },
  });
  return { id: file.id };
}
