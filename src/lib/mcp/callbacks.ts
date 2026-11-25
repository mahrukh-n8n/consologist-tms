import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type {
  McpAccessLevel,
  McpApiKeyValidator,
  McpApprovalRouter,
  McpAuditWriter,
  McpPermissionChecker,
} from "@/modules/mcp/types";
import { requirePageAccess, requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";

export function createApiKeyValidator(db: PrismaClient): McpApiKeyValidator {
  return async (rawKey, companyId) => {
    if (!rawKey?.trim()) throw new Error("MCP_API_KEY is required.");

    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new Error(`Unknown workspace ${companyId}.`);

    const prefix = rawKey.length >= 4 ? rawKey.slice(-4) : rawKey;
    const keys = await db.mcpApiKey.findMany({
      where: { companyId, keyPrefix: prefix },
      select: { id: true, keyHash: true, userId: true, revokedAt: true },
    });

    for (const key of keys) {
      if (key.revokedAt) continue;
      if (await bcrypt.compare(rawKey, key.keyHash)) {
        await db.mcpApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
        return { userId: key.userId, companyId };
      }
    }
    throw new Error("Invalid MCP API key.");
  };
}

export const permissionChecker: McpPermissionChecker = async (userId, companyId, pageKey, level: McpAccessLevel) => {
  if (level === "READ") {
    await requirePageAccess(userId, companyId, pageKey);
    return;
  }

  const user = await requireWriteUser(userId);
  if (!user) throw new Error("MCP writes are not enabled for this user.");
  const gate = await requireWriteGate(userId, companyId, pageKey);
  return { needsApproval: gate.needsApproval };
};

async function requireWriteUser(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mcpWritesEnabled: true } });
  if (!user?.mcpWritesEnabled) throw new Error("MCP writes are not enabled. Enable them in My Account.");
  return true;
}

export const approvalRouter: McpApprovalRouter = async (userId, companyId, requiredPageKey, toolName, input) => {
  const pending = await prisma.pendingApproval.create({
    data: {
      companyId,
      entityType: toolName,
      pageKey: requiredPageKey,
      payload: input as object,
      submittedBy: userId,
    },
    select: { id: true },
  });
  return { pendingApprovalId: pending.id };
};

export const auditWriter: McpAuditWriter = async (entry) => {
  await prisma.auditLog.create({
    data: {
      companyId: entry.companyId,
      userId: entry.userId,
      tableName: "mcp_invocation",
      recordId: 0,
      action: entry.status,
      newValues: {
        toolName: entry.toolName,
        args: entry.args,
        durationMs: entry.durationMs,
        errorDetail: entry.errorDetail ?? null,
        resultDetail: entry.resultDetail ?? null,
        source: entry.source,
      },
    },
  });
};
