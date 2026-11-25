import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  attachTags,
  deleteTag,
  detachTag,
  listTags,
  renameTag,
  renameTagSchema,
  tagIdSchema,
  tagTitlesSchema,
} from "@/lib/tasks/tags";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const tagTools: McpToolDefinition[] = [
  {
    name: "tags.list",
    description: "List workspace tags with usage counts.",
    inputSchema: tagIdSchema.partial().transform(() => ({})),
    requiredPageKey: "manage-system-tags",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ tags: await listTags(ctx.db, ctx.companyId) });
    },
  },
  {
    name: "tags.rename",
    description: "Rename a tag.",
    inputSchema: renameTagSchema,
    requiredPageKey: "manage-system-tags",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { tagId: number; title: string };
      await renameTag(ctx.db, ctx.companyId, data.tagId, data.title);
      return commitResult({ renamed: true });
    },
  },
  {
    name: "tags.delete",
    description: "Delete a tag and its task links.",
    inputSchema: tagIdSchema,
    requiredPageKey: "manage-system-tags",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      await deleteTag(ctx.db, ctx.companyId, (input as { tagId: number }).tagId);
      return commitResult({ deleted: true });
    },
  },
  {
    name: "tags.attach",
    description: "Add create-on-the-go tags to a task.",
    inputSchema: tagTitlesSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { taskId: number; titles: string[] };
      await attachTags(ctx.db, ctx.companyId, ctx.userId, data.taskId, data.titles);
      return commitResult({ attached: true });
    },
  },
  {
    name: "tags.detach",
    description: "Remove a tag from a task.",
    inputSchema: tagIdSchema.extend({ taskId: tagIdSchema.shape.tagId }),
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { taskId: number; tagId: number };
      await detachTag(ctx.db, ctx.companyId, data.taskId, data.tagId);
      return commitResult({ detached: true });
    },
  },
];
