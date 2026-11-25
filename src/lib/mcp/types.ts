/**
 * App-side MCP type constraints.
 *
 * The portable module (`@/modules/mcp`) exports generic types with `TDb = unknown`
 * so it stays database-agnostic. This file constrains those generics to our
 * actual database client (PrismaClient) so all tool files retain full
 * autocomplete and type safety on `ctx.db`.
 *
 * **Rule:** Every tool file in `src/lib/mcp/tools/` should import from here,
 * not from `@/modules/mcp/types`, when it needs `McpToolDefinition` or
 * `McpToolContext`.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  McpToolContext as BaseMcpToolContext,
  McpToolDefinition as BaseMcpToolDefinition,
  McpServerCallbacks as BaseMcpServerCallbacks,
} from "@/modules/mcp/types";

/** Tool context constrained to our Prisma client. */
export type McpToolContext = BaseMcpToolContext<PrismaClient>;

/** Tool definition constrained to our Prisma client. */
export type McpToolDefinition = BaseMcpToolDefinition<PrismaClient>;

/** Server callbacks constrained to our Prisma client. */
export type McpServerCallbacks = BaseMcpServerCallbacks<PrismaClient>;

// Re-export everything else from the portable module that doesn't involve TDb
export type {
  McpSessionContext,
  McpAccessLevel,
  McpToolResultKind,
  McpRequirement,
  McpChoice,
  McpWarning,
  McpBlocker,
  McpNextAction,
  McpToolResult,
  McpErrorCode,
  McpValidatedSession,
  McpApiKeyValidator,
  McpPermissionChecker,
  McpWriteGateResult,
  McpApprovalRouter,
  McpAuditEntry,
  McpAuditWriter,
} from "@/modules/mcp/types";
