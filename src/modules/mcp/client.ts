/**
 * mcp module — CLIENT-SAFE entry point
 *
 * Import from "@/modules/mcp/client" in any "use client" component.
 * This barrel contains NO server-only dependencies (no Prisma runtime, no Node built-ins).
 *
 * For server components and server actions, continue importing from "@/modules/mcp".
 */

// Types (pure TypeScript — no runtime deps)
// Export only the client-safe subset — omit server callback types that reference PrismaClient
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
} from "./types";

// Models (Prisma TYPE re-exports only — import type, not runtime values)
export type {
  McpToolListResponse,
  McpApiKeyRecord,
  McpApiKeyResponse,
  McpWriteToggleResponse,
} from "./models/response-types";
