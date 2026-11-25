import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  MAX_UPLOAD_BYTES,
  listFiles,
  uploadFileSchema,
  uploadWorkspaceFile,
} from "@/lib/files/service";
import { canSeeAllProjects } from "@/lib/projects/access";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const fileTools: McpToolDefinition[] = [
  {
    name: "files.list",
    description: "List workspace file metadata.",
    inputSchema: uploadFileSchema.pick({ projectId: true }).partial().transform(() => ({})),
    requiredPageKey: "files",
    accessLevel: "READ",
    async handler(ctx) {
      const seeAll = await canSeeAllProjects(ctx.db, ctx.userId, ctx.companyId);
      return dataResult({ files: await listFiles(ctx.db, ctx.companyId, undefined, seeAll ? undefined : ctx.userId) });
    },
  },
  {
    name: "files.upload",
    description: "Upload a base64 file to Google Drive (max 10 MB) and record its metadata.",
    inputSchema: uploadFileSchema,
    requiredPageKey: "files",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { projectId: number; name: string; mimeType: string; base64: string };
      const bytes = Buffer.from(data.base64, "base64");
      if (bytes.length === 0) throw new Error("Empty file.");
      if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("Files are limited to 10 MB.");
      return commitResult(await uploadWorkspaceFile(ctx.db, ctx.companyId, ctx.userId, {
        projectId: data.projectId,
        name: data.name,
        mimeType: data.mimeType,
        bytes,
      }));
    },
  },
];
