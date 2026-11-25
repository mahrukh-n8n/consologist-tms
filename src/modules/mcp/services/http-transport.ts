/**
 * MCP HTTP Transport Adapter
 *
 * Adapts the existing MCP server dispatch loop (handleListTools, handleCallTool)
 * to HTTP request/response pattern. Mirrors stdio-transport.ts but returns
 * response objects instead of writing to stdout.
 *
 * Supports async execution: tools exceeding the timeout return `pending`
 * with a `toolCallId` for polling.
 *
 * This is the ONLY file that needs to know about HTTP — the portable module
 * (create-mcp-server.ts) remains unchanged.
 */

import type { McpServer } from "./create-mcp-server";
import { negotiateProtocolVersion } from "./protocol-version";

/** JSON-RPC 2.0 request shape. */
export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC 2.0 response shape. */
export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** Standard JSON-RPC error codes. */
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INTERNAL_ERROR = -32603;
export const RPC_UNAUTHORIZED = -32000;

export function httpStatusForRpcError(code: number): number {
  switch (code) {
    case RPC_PARSE_ERROR:
    case RPC_INVALID_REQUEST:
      return 400;
    case RPC_METHOD_NOT_FOUND:
      return 404;
    case RPC_UNAUTHORIZED:
      return 401;
    case RPC_INTERNAL_ERROR:
    default:
      return 500;
  }
}

/**
 * Handle a single JSON-RPC request through the MCP server.
 * Returns a response object (not written to any stream).
 *
 * For tools/call: this is a synchronous dispatch. Async timeout handling
 * (with pending/polling pattern) is implemented in the route handler
 * (src/app/api/mcp/route.ts) which has access to the async result store.
 *
 * This mirrors the switch statement in stdio-transport.ts exactly.
 */
export async function handleMcpHttpRequest(
  request: JsonRpcRequest,
  server: McpServer,
): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  if (!request.method || typeof request.method !== "string") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: RPC_INVALID_REQUEST, message: "Invalid Request" },
    };
  }

  try {
    switch (request.method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: negotiateProtocolVersion(
              (request.params as { protocolVersion?: unknown } | undefined)?.protocolVersion
            ),
            capabilities: { tools: {} },
            serverInfo: { name: "consologist-mcp", version: "1.0.0" },
          },
        };
      }

      case "tools/list": {
        const result = await server.handleListTools();
        return { jsonrpc: "2.0", id, result };
      }

      case "tools/call": {
        const params = request.params ?? {};
        const toolName = params.name as string | undefined;
        const toolArgs = params.arguments as Record<string, unknown> | undefined;

        if (!toolName) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: RPC_INVALID_REQUEST, message: "Missing tool name" },
          };
        }

        // NOTE: Async timeout handling lives in the route handler
        // (src/app/api/mcp/route.ts) which has access to the async result store.
        // This function handles the synchronous dispatch only.
        const result = await server.handleCallTool({
          name: toolName,
          arguments: toolArgs,
        });

        // Map McpToolResult to MCP protocol content format (same as stdio)
        // Use custom replacer to handle Decimal, Date, BigInt serialization
        const serialized = JSON.stringify(result, (key, value) => {
          if (value === undefined) return undefined; // omit undefined fields
          if (value === null) return null;
          // Decimal.js has isDecimal property
          if (typeof value === "object" && value !== null && "isDecimal" in value) {
            return value.toString();
          }
          if (value instanceof Date) return value.toISOString();
          if (typeof value === "bigint") return value.toString();
          return value;
        }, 2);

        if (result.ok) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: serialized,
                },
              ],
            },
          };
        } else {
          // Tool-level errors returned as content with isError flag
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: serialized,
                },
              ],
              isError: true,
            },
          };
        }
      }

      case "notifications/initialized":
      case "notifications/cancelled": {
        // Notification — no response required
        return { jsonrpc: "2.0", id, result: null };
      }

      case "ping": {
        return { jsonrpc: "2.0", id, result: {} };
      }

      default: {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: RPC_METHOD_NOT_FOUND, message: `Method not found: ${request.method}` },
        };
      }
    }
  } catch {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: RPC_INTERNAL_ERROR, message: "Internal error" },
    };
  }
}
