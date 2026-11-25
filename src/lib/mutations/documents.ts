import type { PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import { assertProjectMember } from "@/lib/projects/access";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentSchema,
  createDocumentSchema,
  updateDocumentSchema,
} from "@/lib/documents/schema";

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export async function gkCreateDocument(
  db: Db,
  companyId: number,
  userId: number,
  input: z.infer<typeof createDocumentSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  await assertProjectMember(db, companyId, userId, input.projectId);
  return db.projectDocument.create({
    data: { projectId: input.projectId, title: input.title, createdById: userId, updatedById: userId },
  });
}

export async function gkUpdateDocument(
  db: Db,
  companyId: number,
  userId: number,
  input: z.infer<typeof updateDocumentSchema>
) {
  return db.$transaction(async (tx: Tx) => {
    const doc = await tx.projectDocument.findFirst({
      where: { id: input.documentId, project: { group: { companyId } } },
      select: { id: true, version: true, title: true, contentMarkdown: true, projectId: true },
    });
    if (!doc) throw new Error("Document not found in this workspace.");
    await assertProjectMember(tx, companyId, userId, doc.projectId);
    if (doc.version !== input.version) {
      throw new Error("This document changed in another window. Reload before saving.");
    }
    const updated = await tx.projectDocument.update({
      where: { id: doc.id },
      data: {
        title: input.title,
        contentMarkdown: input.contentMarkdown,
        updatedById: userId,
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        companyId,
        userId,
        tableName: "project_documents",
        recordId: doc.id,
        action: "UPDATE",
        oldValues: { title: doc.title, contentLength: doc.contentMarkdown.length, version: doc.version },
        newValues: { title: updated.title, contentLength: updated.contentMarkdown.length, version: updated.version },
        changedFields: ["title", "contentMarkdown"],
      },
    });
    return updated;
  });
}

export async function gkAddDocumentAttachment(
  db: Db,
  companyId: number,
  userId: number,
  input: z.infer<typeof attachmentSchema>
) {
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length === 0) throw new Error("Attachment is empty.");
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Attachments are limited to 5 MB.");
  const doc = await db.projectDocument.findFirst({
    where: { id: input.documentId, project: { group: { companyId } } },
    select: { id: true, projectId: true },
  });
  if (!doc) throw new Error("Document not found in this workspace.");
  await assertProjectMember(db, companyId, userId, doc.projectId);
  return db.documentAttachment.create({
    data: {
      documentId: doc.id,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: bytes.length,
      data: bytes,
      createdById: userId,
    },
    select: { id: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true },
  });
}

export async function gkDeleteDocumentAttachment(
  db: Db,
  companyId: number,
  userId: number,
  attachmentId: number
) {
  const attachment = await db.documentAttachment.findFirst({
    where: { id: attachmentId, document: { project: { group: { companyId } } } },
    select: { id: true, document: { select: { projectId: true } } },
  });
  if (!attachment) throw new Error("Attachment not found in this workspace.");
  await assertProjectMember(db, companyId, userId, attachment.document.projectId);
  await db.documentAttachment.delete({ where: { id: attachment.id } });
}

/** Audited document deletion. Attachment bytes are not copied into the audit snapshot. */
export async function deleteDocumentWithAudit(
  db: Db,
  input: { companyId: number; actorId: number; documentId: number; reason: string }
) {
  if (!input.reason.trim()) throw new Error("A deletion reason is required.");
  return db.$transaction(async (tx: Tx) => {
    const doc = await tx.projectDocument.findFirst({
      where: { id: input.documentId, project: { group: { companyId: input.companyId } } },
      include: {
        project: { select: { id: true, name: true } },
        attachments: { select: { id: true, kind: true, fileName: true, mimeType: true, size: true, createdById: true, createdAt: true } },
      },
    });
    if (!doc) throw new Error("Document not found in this workspace.");
    await assertProjectMember(tx, input.companyId, input.actorId, doc.projectId);
    const audit = await tx.deletionAudit.create({
      data: {
        companyId: input.companyId,
        actorId: input.actorId,
        entityType: "ProjectDocument",
        entityId: doc.id,
        reason: input.reason.trim(),
        snapshot: { document: { ...doc, attachments: undefined }, attachments: doc.attachments },
      },
    });
    await tx.projectDocument.delete({ where: { id: doc.id } });
    return audit;
  });
}
