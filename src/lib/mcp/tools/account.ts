import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  getAlertPreferences,
  updateAlertPreferences,
  updateAlertPreferencesSchema,
} from "@/lib/account/alert-preferences";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const accountTools: McpToolDefinition[] = [
  {
    name: "account.get_alert_prefs",
    description: "Read the caller's email alert preferences (assignee-only alerts).",
    inputSchema: updateAlertPreferencesSchema.partial().transform(() => ({})),
    requiredPageKey: "manage-account",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult(await getAlertPreferences(ctx.db, ctx.userId, ctx.companyId));
    },
  },
  {
    name: "account.update_alert_prefs",
    description: "Update email alert preferences: due soon, overdue, comment, mention and the daily diary digest.",
    inputSchema: updateAlertPreferencesSchema,
    requiredPageKey: "manage-account",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { dueSoon: boolean; overdue: boolean; comment: boolean; mention: boolean; digest: boolean };
      const saved = await updateAlertPreferences(ctx.db, {
        userId: ctx.userId,
        companyId: ctx.companyId,
        ...data,
      });
      return commitResult(saved);
    },
  },
];
