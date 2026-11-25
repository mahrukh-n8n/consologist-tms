/**
 * MCP HTTP Transport — Standardized Error Responses
 *
 * All error responses from the HTTP route handler go through this module
 * to ensure consistent JSON-RPC 2.0 error envelope format.
 */

import type { JsonRpcResponse } from "@/modules/mcp/services/http-transport";

/**
 * Create a standardized JSON-RPC error response.
 */
export function jsonRpcErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}
