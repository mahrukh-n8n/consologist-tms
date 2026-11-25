import { z } from "zod";
import type { McpToolDefinition } from "@/lib/mcp/types";
import { MAX_UPLOAD_BYTES, listTaskFiles, uploadTaskFile } from "@/lib/files/service";
import { gkDeleteTaskFile } from "@/lib/mutations/task-files";
import { canSeeAllProjects } from "@/lib/projects/access";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

const taskRefSchema = z.object({ taskId: z.coerce.number().int().positive() });

const attachSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  base64: z.string().min(1),
});

const removeSchema = z.object({ fileId: z.coerce.number().int().positive() });

export const taskFileTools: McpToolDefinition[] = [
  {
    name: "tasks.list_files",
    description: "List the Google Drive attachments linked to a task.",
    inputSchema: taskRefSchema,
    requiredPageKey: "tasks",
    accessLevel: "READ",
    async handler(ctx, input) {
      const { taskId } = input as z.infer<typeof taskRefSchema>;
      const seeAll = await canSeeAllProjects(ctx.db, ctx.userId, ctx.companyId);
      return dataResult({ files: await listTaskFiles(ctx.db, ctx.companyId, taskId, seeAll ? undefined : ctx.userId) });
    },
  },
  {
    name: "tasks.attach_file",
    description: "Upload a base64 file to Google Drive (max 10 MB) and attach it to a task. Google Drive must be connected.",
    inputSchema: attachSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as z.infer<typeof attachSchema>;
      const bytes = Buffer.from(data.base64, "base64");
      if (bytes.length === 0) throw new Error("Empty file.");
      if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("Files are limited to 10 MB.");
      return commitResult(await uploadTaskFile(ctx.db, ctx.companyId, ctx.userId, {
        taskId: data.taskId,
        name: data.name,
        mimeType: data.mimeType,
        bytes,
      }));
    },
  },
  {
    name: "tasks.remove_file",
    description: "Remove a task attachment from the workspace. The Google Drive object is retained.",
    inputSchema: removeSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const { fileId } = input as z.infer<typeof removeSchema>;
      return commitResult(await gkDeleteTaskFile(ctx.db, ctx.companyId, ctx.userId, fileId));
    },
  },
];
