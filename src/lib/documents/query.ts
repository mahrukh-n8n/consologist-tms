import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import type { listDocumentsSchema } from "./schema";

type DocumentFilters = z.infer<typeof listDocumentsSchema>;

function documentListQuery(companyId: number, { archived, projectId, afterId }: DocumentFilters, memberUserId?: number) {
  return {
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    where: {
      archivedAt: archived ? { not: null } : null,
      project: {
        group: { companyId },
        ...(projectId ? { id: projectId } : {}),
        ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
      },
    },
  } satisfies Prisma.ProjectDocumentFindManyArgs;
}

export const DOCUMENT_PAGE_SIZE = 25;

export function listDocumentRows(db: PrismaClient, companyId: number, filters: DocumentFilters, memberUserId?: number) {
  return db.projectDocument.findMany({
    ...documentListQuery(companyId, filters, memberUserId),
    select: {
      id: true, title: true, updatedAt: true, version: true,
      project: { select: { name: true } }, _count: { select: { attachments: true } },
    },
    take: DOCUMENT_PAGE_SIZE + 1,
  });
}

export function listDocuments(db: PrismaClient, companyId: number, filters: DocumentFilters, memberUserId?: number) {
  return db.projectDocument.findMany({
    ...documentListQuery(companyId, filters, memberUserId),
    include: {
      project: { select: { id: true, name: true } },
      attachments: { select: { id: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true } },
    },
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
