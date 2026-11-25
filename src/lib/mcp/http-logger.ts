/**
 * MCP HTTP Transport — Structured Request Logger
 *
 * Logs every MCP HTTP request with structured JSON for easy parsing.
 * Called at the end of every request in the route handler.
 *
 * Never logs PII — only IDs (userId, companyId), never request bodies
 * or tool arguments (those are in the audit log).
 */

export interface McpLogEntry {
  timestamp: string;
  requestId: string;
  userId?: number;
  companyId?: number;
  method: string; // JSON-RPC method
  toolName?: string;
  durationMs: number;
  status: "success" | "error" | "pending" | "rate-limited" | "unauthorized";
  statusCode: number;
  errorMessage?: string;
}

/**
 * Log an MCP request entry. Uses console.log with structured JSON.
 */
export function logMcpRequest(entry: McpLogEntry): void {
  const logLine = {
    mcp: true,
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  if (entry.status === "error" || entry.status === "unauthorized") {
    console.warn(JSON.stringify(logLine));
  } else {
    console.log(JSON.stringify(logLine));
  }
}
