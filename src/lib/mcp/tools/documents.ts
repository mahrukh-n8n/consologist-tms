import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  attachmentSchema,
  createDocumentSchema,
  deleteAttachmentSchema,
  deleteDocumentSchema,
  getDocumentSchema,
  listDocumentsSchema,
  updateDocumentSchema,
} from "@/lib/documents/schema";
import { getDocument, listDocuments } from "@/lib/documents/query";
import {
  deleteDocumentWithAudit,
  gkAddDocumentAttachment,
  gkCreateDocument,
  gkDeleteDocumentAttachment,
  gkUpdateDocument,
} from "@/lib/mutations/documents";
import { assertProjectAccess, canSeeAllProjects } from "@/lib/projects/access";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const documentTools: McpToolDefinition[] = [
  {
    name: "documents.list",
    description: "List project documents with attachment metadata.",
    inputSchema: listDocumentsSchema,
    requiredPageKey: "documents",
    accessLevel: "READ",
    async handler(ctx, input) {
      const projectId = (input as { projectId?: number }).projectId;
      const seeAll = await canSeeAllProjects(ctx.db, ctx.userId, ctx.companyId);
      return dataResult({ documents: await listDocuments(ctx.db, ctx.companyId, projectId, seeAll ? undefined : ctx.userId) });
    },
  },
  {
    name: "documents.get",
    description: "Read one document with markdown content and attachments.",
    inputSchema: getDocumentSchema,
    requiredPageKey: "documents",
    accessLevel: "READ",
    async handler(ctx, input) {
      const documentId = (input as { documentId: number }).documentId;
      const doc = await getDocument(ctx.db, ctx.companyId, documentId);
      if (!doc) throw new Error("Document not found in this workspace.");
      await assertProjectAccess(ctx.db, ctx.companyId, ctx.userId, doc.projectId);
      return dataResult(doc);
    },
  },
  {
    name: "documents.create",
    description: "Create a project document.",
    inputSchema: createDocumentSchema,
    requiredPageKey: "documents",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const doc = await gkCreateDocument(ctx.db, ctx.companyId, ctx.userId, input as never);
      return commitResult(doc);
    },
  },
  {
    name: "documents.update",
    description: "Update a document title/content. Pass the current version for conflict detection.",
    inputSchema: updateDocumentSchema,
    requiredPageKey: "documents",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const doc = await gkUpdateDocument(ctx.db, ctx.companyId, ctx.userId, input as never);
      return commitResult(doc);
    },
  },
  {
    name: "documents.delete",
    description: "Delete a document with an immutable audit snapshot. A reason is required.",
    inputSchema: deleteDocumentSchema,
    requiredPageKey: "documents",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { documentId: number; reason: string };
      const audit = await deleteDocumentWithAudit(ctx.db, {
        companyId: ctx.companyId,
        actorId: ctx.userId,
        documentId: data.documentId,
        reason: data.reason,
      });
      return commitResult({ deleted: true, deletionAuditId: audit.id });
    },
  },
  {
    name: "documents.add_attachment",
    description: "Attach a base64 audio/image/file (max 5 MB) to a document.",
    inputSchema: attachmentSchema,
    requiredPageKey: "documents",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const attachment = await gkAddDocumentAttachment(ctx.db, ctx.companyId, ctx.userId, input as never);
      return commitResult(attachment);
    },
  },
  {
    name: "documents.delete_attachment",
    description: "Delete a document attachment.",
    inputSchema: deleteAttachmentSchema,
    requiredPageKey: "documents",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      await gkDeleteDocumentAttachment(ctx.db, ctx.companyId, ctx.userId, (input as { attachmentId: number }).attachmentId);
      return commitResult({ deleted: true });
    },
  },
];
