import { z } from "zod";
import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  archiveCustomStatus,
  archiveCustomStatusSchema,
  createCustomStatusSchema,
  gkCreateCustomStatus,
  listCustomStatuses,
} from "@/lib/tasks/custom-statuses";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const statusTools: McpToolDefinition[] = [
  {
    name: "statuses.list",
    description: "List the workspace custom task statuses.",
    inputSchema: z.object({}),
    requiredPageKey: "manage-system-statuses",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ statuses: await listCustomStatuses(ctx.db, ctx.companyId) });
    },
  },
  {
    name: "statuses.create",
    description: "Create a custom task status.",
    inputSchema: createCustomStatusSchema,
    requiredPageKey: "manage-system-statuses",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkCreateCustomStatus(ctx.db, ctx.companyId, input as never));
    },
  },
  {
    name: "statuses.archive",
    description: "Archive a custom task status.",
    inputSchema: archiveCustomStatusSchema,
    requiredPageKey: "manage-system-statuses",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const { statusId } = input as { statusId: number };
      await archiveCustomStatus(ctx.db, ctx.companyId, statusId);
      return commitResult({ statusId, archived: true });
    },
  },
];
