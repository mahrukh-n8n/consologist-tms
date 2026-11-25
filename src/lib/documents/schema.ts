import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const listDocumentsSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
});

export const getDocumentSchema = z.object({
  documentId: z.coerce.number().int().positive(),
});

export const createDocumentSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
});

export const updateDocumentSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  contentMarkdown: z.string().max(500_000),
  version: z.coerce.number().int().positive(),
});

export const deleteDocumentSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export const attachmentSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  kind: z.enum(["AUDIO", "IMAGE", "FILE"]).default("FILE"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  base64: z.string().min(1),
});

export const deleteAttachmentSchema = z.object({
  attachmentId: z.coerce.number().int().positive(),
});
