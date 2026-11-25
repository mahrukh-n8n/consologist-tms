import { serializeAuditArgs } from "../utils/audit-args";
/**
 * MCP Module — Server Dispatch Loop
 *
 * Creates the portable MCP server using only injected callbacks.
 * Zero imports from app business logic, Next.js, or Node built-ins.
 */

import type {
  McpServerCallbacks,
  McpSessionContext,
  McpToolResult,
  McpWriteGateResult,
  McpToolDefinition,
} from "../types";
import type { ToolRegistry } from "../registry/tool-registry";
import { serializeDeep, errorResult, approvalResult } from "../utils/serialize";
import { readOnlyDb, ReadOnlyToolError } from "./read-only-db";

/**
 * Non-generic view of a tool definition — matches the registry's internal type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = McpToolDefinition<any>;

export type McpServer = {
  /**
   * Dispatch a tools/list request.
   * Filters to tools the session user has access to (READ or WRITE).
   * WRITE tools are hidden when mcpWritesEnabled=false (enforced via permissionChecker).
   */
  handleListTools(): Promise<McpListToolsResponse>;

  /**
   * Dispatch a tools/call request.
   * Runs permission check → approval check → handler → audit.
   */
  handleCallTool(params: McpCallToolParams): Promise<McpToolResult>;
};

export type McpListToolsResponse = {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
};

export type McpCallToolParams = {
  name: string;
  arguments?: Record<string, unknown>;
  /**
   * AbortSignal for cancellation (HTTP transport only).
   * Passed through to tool handlers via McpToolContext.
   */
  signal?: AbortSignal;
};

/**
 * Create the portable MCP server dispatch loop.
 * All app-specific behavior flows through the injected callbacks.
 */
export function createMcpServer<TDb = unknown>(
  session: McpSessionContext,
  registry: ToolRegistry,
  callbacks: McpServerCallbacks<TDb>
): McpServer {
  const { userId, companyId } = session;

  return {
    async handleListTools(): Promise<McpListToolsResponse> {
      const tools: McpListToolsResponse["tools"] = [];

      for (const tool of registry.all() as ReadonlyArray<AnyTool>) {
        try {
          // Attempt a permission check — if it throws, the tool is not visible
          await callbacks.permissionChecker(userId, companyId, tool.requiredPageKey, tool.accessLevel);

          // Convert Zod schema to JSON Schema for MCP protocol
          const inputSchema = zodToJsonSchema(tool.inputSchema);

          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema,
          });
        } catch {
          // Tool not accessible to this session — omit from list
        }
      }

      return { tools };
    },

    async handleCallTool(params: McpCallToolParams): Promise<McpToolResult> {
      const startMs = Date.now();
      const tool = registry.get(params.name) as AnyTool | undefined;

      if (!tool) {
        const result = errorResult(
          `Tool "${params.name}" not found.`,
          "NOT_FOUND"
        );
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: params.name,
          args: serializeAuditArgs(params.arguments ?? {}),
          status: "error",
          durationMs: Date.now() - startMs,
          errorDetail: result.error,
          source: "mcp",
        });
        return result;
      }

      // Parse + validate input with the tool's Zod schema
      const parseResult = tool.inputSchema.safeParse(params.arguments ?? {});
      if (!parseResult.success) {
        const detail = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        const result = errorResult(
          `Validation failed: ${detail}`,
          "VALIDATION_ERROR"
        );
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: tool.name,
          args: serializeAuditArgs(params.arguments ?? {}),
          status: "error",
          durationMs: Date.now() - startMs,
          errorDetail: result.error,
          source: "mcp",
        });
        return result;
      }

      const validatedInput = parseResult.data;

      // Permission check
      let gateResult: McpWriteGateResult | void;
      try {
        gateResult = await callbacks.permissionChecker(
          userId, companyId, tool.requiredPageKey, tool.accessLevel
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isWriteDisabled = msg.includes("MCP writes are not enabled");
        const result = errorResult(
          msg,
          isWriteDisabled ? "WRITE_DISABLED" : "PERMISSION_DENIED"
        );
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: tool.name,
          args: serializeAuditArgs(validatedInput),
          status: isWriteDisabled ? "write-disabled" : "permission-denied",
          durationMs: Date.now() - startMs,
          errorDetail: msg,
          source: "mcp",
        });
        return result;
      }

      // Approval routing for WRITE tools
      if (tool.accessLevel === "WRITE" && gateResult && (gateResult as McpWriteGateResult).needsApproval) {
        try {
          const { pendingApprovalId } = await callbacks.approvalRouter(
            userId, companyId, tool.requiredPageKey, tool.name, validatedInput
          );
          const result = approvalResult(pendingApprovalId);
          await safeAudit(callbacks, {
            userId, companyId,
            toolName: tool.name,
            args: serializeAuditArgs(validatedInput),
            status: "pending-approval",
            durationMs: Date.now() - startMs,
            resultDetail: String(pendingApprovalId),
            source: "mcp",
          });
          return result;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const result = errorResult(msg, "INTERNAL_ERROR");
          await safeAudit(callbacks, {
            userId, companyId,
            toolName: tool.name,
            args: serializeAuditArgs(validatedInput),
            status: "error",
            durationMs: Date.now() - startMs,
            errorDetail: msg,
            source: "mcp",
          });
          return result;
        }
      }

      // Execute the handler
      let result: McpToolResult;
      try {
        // Check for cancellation before invoking handler
        if (params.signal?.aborted) {
          const reason = params.signal.reason instanceof Error
            ? params.signal.reason.message
            : String(params.signal.reason ?? "Cancelled");
          return errorResult(reason, "INVALID_STATE");
        }

        const invoke = () => tool.handler(
          {
            db: tool.accessLevel === "READ" ? readOnlyDb(callbacks.db) : callbacks.db,
            userId, companyId, requestId: session.requestId, signal: params.signal,
          },
          validatedInput,
        );
        result = tool.accessLevel === "READ" && callbacks.runReadOnlyTool
          ? await callbacks.runReadOnlyTool(tool.name, invoke)
          : await invoke();
        // Deep-serialize to catch any remaining unsafe types
        result = serializeDeep(result) as McpToolResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // stderr is the only sanctioned side-channel in the portable module.
        process.stderr.write(
          `[mcp] Handler error in "${tool.name}": ${msg}\n${err instanceof Error && err.stack ? err.stack : ""}\n`
        );
        result = mapGatekeeperError(err, msg);
        await safeAudit(callbacks, {
          userId, companyId,
          toolName: tool.name,
          args: serializeAuditArgs(validatedInput),
          status: "error",
          durationMs: Date.now() - startMs,
          errorDetail: msg,
          source: "mcp",
        });
        return result;
      }

      await safeAudit(callbacks, {
        userId, companyId,
        toolName: tool.name,
        args: serializeAuditArgs(validatedInput),
        status: "success",
        durationMs: Date.now() - startMs,
        source: "mcp",
      });

      return result;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map gatekeeper errors to structured MCP error codes. */
export function mapGatekeeperError(err: unknown, msg: string): McpToolResult {
  if (err instanceof ReadOnlyToolError) {
    return errorResult(msg, "PERMISSION_DENIED");
  }
  if (err instanceof Error && err.name === "PermissionError") {
    return errorResult(msg, "PERMISSION_DENIED");
  }
  // Prisma unique constraint
  if (msg.includes("P2002") || msg.includes("Unique constraint")) {
    return errorResult("A record with these details already exists.", "CONFLICT");
  }
  // Prisma not found
  if (msg.includes("P2025") || msg.includes("Record to update not found")) {
    return errorResult("The requested record was not found.", "NOT_FOUND");
  }
  // Status transition violations
  if (
    msg.includes("not allowed from") ||
    msg.includes("status transition") ||
    msg.includes("state transition") ||
    (msg.includes("Cannot") && (msg.includes("status") || msg.includes("state"))) ||
    msg.includes("Invalid state")
  ) {
    return errorResult(msg, "INVALID_STATE");
  }
  // Validation / subtype / clearing-currency / balance equation errors
  if (
    msg.includes("must have subtype") ||
    msg.includes("Validation") ||
    msg.includes("balance") ||
    msg.includes("Insufficient") ||
    msg.includes("multiple inventory account currencies") ||
    msg.includes("one inventory account currency")
  ) {
    return errorResult(msg, "VALIDATION_ERROR");
  }
  // Anything else — a domain rule that matches none of the patterns above, or
  // an unexpected failure. Keep the INTERNAL_ERROR code but forward the actual
  // message so the caller can act on it. Stack traces are never included.
  void err; // suppress unused-variable lint
  return errorResult(msg, "INTERNAL_ERROR");
}

/** Fire-and-forget audit write — never throws. */
async function safeAudit(
  callbacks: McpServerCallbacks,
  entry: Parameters<McpServerCallbacks["auditWriter"]>[0]
): Promise<void> {
  try {
    await callbacks.auditWriter(entry);
  } catch {
    // Audit failure must never surface to the caller
  }
}

/**
 * Convert a Zod 4 schema to JSON Schema for the MCP protocol.
 * Uses Zod 4's built-in toJSONSchema() method which handles all
 * Zod types (objects, enums, optional, arrays, nested, etc.) correctly.
 * Falls back to a minimal object schema on failure.
 */
function zodToJsonSchema(schema: import("zod").ZodSchema): Record<string, unknown> {
  try {
    // Zod 4 exposes toJSONSchema() directly on schema instances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const z = schema as any;
    if (typeof z.toJSONSchema === "function") {
      return z.toJSONSchema() as Record<string, unknown>;
    }
  } catch {
    // Fall through to default
  }
  return { type: "object" };
}
