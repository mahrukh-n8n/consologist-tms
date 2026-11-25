import { z } from "zod";
import type { McpToolDefinition } from "@/lib/mcp/types";
import { assignTemplate } from "@/modules/auth-rbac/services/assignment-service";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const assignTemplateSchema = z.object({
  userId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
});

export const permissionTools: McpToolDefinition[] = [
  {
    name: "permissions.list",
    description: "List permission templates and member assignments.",
    inputSchema: assignTemplateSchema.partial().transform(() => ({})),
    requiredPageKey: "manage-system-permissions",
    accessLevel: "READ",
    async handler(ctx) {
      const [templates, members] = await Promise.all([
        ctx.db.permissionTemplate.findMany({
          where: { companyId: ctx.companyId },
          include: { pages: { select: { pageKey: true, accessLevel: true, requiresApproval: true } } },
          orderBy: { name: "asc" },
        }),
        ctx.db.userCompanyRole.findMany({
          where: { companyId: ctx.companyId },
          include: {
            user: {
              select: {
                id: true, email: true, fullName: true,
                permissionAssignments: { where: { companyId: ctx.companyId }, select: { templateId: true } },
              },
            },
          },
        }),
      ]);
      return dataResult({ templates, members });
    },
  },
  {
    name: "permissions.assign_template",
    description: "Assign a permission template to a workspace member.",
    inputSchema: assignTemplateSchema,
    requiredPageKey: "manage-system-permissions",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { userId: number; templateId: number };
      const assignment = await assignTemplate(ctx.db, {
        userId: data.userId,
        companyId: ctx.companyId,
        templateId: data.templateId,
        assignedBy: ctx.userId,
      });
      return commitResult(assignment);
    },
  },
];
