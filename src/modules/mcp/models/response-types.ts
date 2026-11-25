/**
 * MCP Module — App-specific response types
 *
 * These types live alongside the portable module but are app-specific.
 * They describe serializable response shapes used by the Settings → API Keys UI.
 *
 * NOTE: This file is NOT part of the portable contract.
 * When porting the MCP module to a new app, this file should be recreated
 * to match the new app's API key and settings data model.
 */

/**
 * Minimal record shapes returned by MCP read tools.
 * These are plain serializable objects — not Prisma model instances.
 */

export type McpApiKeyRecord = {
  id: number;
  keyPrefix: string;
  label: string | null;
  createdAt: string; // ISO
  lastUsedAt: string | null; // ISO
  revokedAt: string | null; // ISO
};

export type McpToolListResponse = {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
};

export type McpApiKeyResponse = {
  key: McpApiKeyRecord;
};

export type McpWriteToggleResponse = {
  mcpWritesEnabled: boolean;
};
