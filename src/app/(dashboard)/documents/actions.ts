"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageAccess, requirePageWrite, requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import {
  attachmentSchema,
  createDocumentSchema,
  deleteAttachmentSchema,
  deleteDocumentSchema,
  updateDocumentSchema,
} from "@/lib/documents/schema";
import {
  deleteDocumentWithAudit,
  gkAddDocumentAttachment,
  gkCreateDocument,
  gkDeleteDocumentAttachment,
  gkSetDocumentArchived,
  gkUpdateDocument,
} from "@/lib/mutations/documents";
import { getDocument } from "@/lib/documents/query";
import { assertProjectAccess } from "@/lib/projects/access";

export type DocumentState = { success: boolean; error?: string; version?: number };
export type AttachmentState = {
  success: boolean;
  error?: string;
  attachment?: { id: number; kind: string; fileName: string; mimeType: string; size: number; createdAt: string };
};

export async function createDocumentAction(_prev: DocumentState, formData: FormData): Promise<DocumentState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "documents");
    const parsed = createDocumentSchema.safeParse({ projectId: formData.get("projectId"), title: formData.get("title") });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid document." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "ProjectDocument", pageKey: "documents", payload: parsed.data, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkCreateDocument(prisma, company.id, user.id, parsed.data);
    revalidatePath("/documents");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Document creation failed." }; }
}

export async function updateDocumentAction(_prev: DocumentState, formData: FormData): Promise<DocumentState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "documents");
    const parsed = updateDocumentSchema.safeParse({
      documentId: formData.get("documentId"),
      title: formData.get("title"),
      contentMarkdown: formData.get("contentMarkdown"),
      version: formData.get("version"),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid document." };
    const updated = await gkUpdateDocument(prisma, company.id, user.id, parsed.data);
    revalidatePath("/documents");
    return { success: true, version: updated.version };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Save failed." }; }
}

export async function setDocumentArchivedAction(documentId: number, archived: boolean): Promise<DocumentState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "documents");
    await gkSetDocumentArchived(prisma, company.id, user.id, { documentId, archived });
    revalidatePath("/documents");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Document update failed." }; }
}

export async function deleteDocumentAction(_prev: DocumentState, formData: FormData): Promise<DocumentState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "documents");
    const parsed = deleteDocumentSchema.safeParse({
      documentId: formData.get("documentId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return { success: false, error: "A deletion reason is required." };
    await deleteDocumentWithAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      documentId: parsed.data.documentId,
      reason: parsed.data.reason,
    });
    revalidatePath("/documents");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Delete failed." }; }
}

export async function uploadAttachmentAction(_prev: AttachmentState, formData: FormData): Promise<AttachmentState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "documents");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { success: false, error: "Choose a file to attach." };
    if (file.size > 5 * 1024 * 1024) return { success: false, error: "Attachments are limited to 5 MB." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = attachmentSchema.safeParse({
      documentId: formData.get("documentId"),
      kind: String(file.type).startsWith("audio/") ? "AUDIO" : String(file.type).startsWith("image/") ? "IMAGE" : "FILE",
      fileName: file.name || "voice-note.webm",
      mimeType: file.type || "application/octet-stream",
      base64: bytes.toString("base64"),
    });
    if (!parsed.success) return { success: false, error: "Invalid attachment." };
    const attachment = await gkAddDocumentAttachment(prisma, company.id, user.id, parsed.data);
    revalidatePath("/documents");
    return { success: true, attachment: { ...attachment, createdAt: attachment.createdAt.toISOString() } };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Upload failed." }; }
}

export async function deleteAttachmentAction(_prev: AttachmentState, formData: FormData): Promise<AttachmentState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "documents");
    const parsed = deleteAttachmentSchema.safeParse({ attachmentId: formData.get("attachmentId") });
    if (!parsed.success) return { success: false, error: "Invalid attachment." };
    await gkDeleteDocumentAttachment(prisma, company.id, user.id, parsed.data.attachmentId);
    revalidatePath("/documents");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Delete failed." }; }
}

export async function refreshDocumentAction(documentId: number) {
  const { user, company } = await requireCompany();
  await requirePageAccess(user.id, company.id, "documents");
  const doc = await getDocument(prisma, company.id, documentId);
  if (!doc) return null;
  await assertProjectAccess(prisma, company.id, user.id, doc.projectId);
  return doc;
}
