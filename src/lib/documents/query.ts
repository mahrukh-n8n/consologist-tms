import type { PrismaClient } from "@/generated/prisma/client";

export function listDocuments(db: PrismaClient, companyId: number, projectId?: number, memberUserId?: number) {
  return db.projectDocument.findMany({
    where: {
      project: {
        group: { companyId },
        ...(projectId ? { id: projectId } : {}),
        ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
      },
    },
    include: {
      project: { select: { id: true, name: true } },
      attachments: { select: { id: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  });
}

export function getDocument(db: PrismaClient, companyId: number, documentId: number) {
  return db.projectDocument.findFirst({
    where: { id: documentId, project: { group: { companyId } } },
    include: {
      project: { select: { id: true, name: true } },
      attachments: {
        select: { id: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
