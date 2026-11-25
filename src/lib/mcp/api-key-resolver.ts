/**
 * MCP HTTP Transport — API Key Resolver
 *
 * Resolves a raw API key to its database ID and company context
 * for rate limiting, usage tracking, and session initialization.
 * Uses bcrypt comparison (same as the validator in callbacks.ts).
 */

import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/db";

export type ApiKeyResolution = {
  apiKeyId: number;
  companyId: number;
  userId: number;
};

/**
 * Resolve a raw API key to its database ID, company, and user.
 * Scans all non-revoked keys across all companies.
 * Returns null if the key is invalid or revoked.
 *
 * Uses keyPrefix to narrow the candidate set before bcrypt comparison,
 * reducing O(N) bcrypt comparisons to O(matches) where matches is
 * typically 0-1 keys.
 *
 * This is used during initialization to derive companyId from the key
 * itself, eliminating the need for MCP_COMPANY_ID env var.
 */
export async function resolveApiKeyByKey(rawKey: string): Promise<ApiKeyResolution | null> {
  const db = getPrisma();

  // Use keyPrefix (last 4 chars of the original key) to narrow candidates.
  // keyPrefix is stored when the key is created.
  const prefix = rawKey.length >= 4 ? rawKey.slice(-4) : rawKey;

  const apiKeys = await db.mcpApiKey.findMany({
    where: { revokedAt: null, keyPrefix: prefix },
    select: {
      id: true,
      companyId: true,
      userId: true,
      keyHash: true,
    },
  });

  // With prefix filter, typically 0-1 keys remain
  for (const apiKey of apiKeys) {
    const matches = await bcrypt.compare(rawKey, apiKey.keyHash);
    if (matches) {
      return {
        apiKeyId: apiKey.id,
        companyId: apiKey.companyId,
        userId: apiKey.userId,
      };
    }
  }

  return null;
}

/**
 * Resolve a raw API key to its database ID within a known company.
 * Returns null if the key is invalid, revoked, or doesn't belong to the company.
 * Used for post-initialize revalidation.
 */
export async function resolveMcpApiKeyId(
  rawKey: string,
  companyId: number
): Promise<number | null> {
  const db = getPrisma();

  const apiKeys = await db.mcpApiKey.findMany({
    where: { companyId },
    select: {
      id: true,
      keyHash: true,
      revokedAt: true,
    },
  });

  for (const apiKey of apiKeys) {
    if (apiKey.revokedAt) continue;
    const matches = await bcrypt.compare(rawKey, apiKey.keyHash);
    if (matches) {
      return apiKey.id;
    }
  }

  return null;
}
