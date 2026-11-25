/**
 * MCP Module — stdio JSON-RPC Transport
 *
 * Reads newline-delimited JSON-RPC 2.0 messages from stdin,
 * dispatches to the MCP server, and writes responses to stdout.
 *
 * Portable: the only Node.js built-ins used here are process.stdin/stdout,
 * which are acceptable for a subprocess entry — this file is never imported
 * by the Next.js app bundle.
 */

import type { McpServer } from "./create-mcp-server";
import { negotiateProtocolVersion } from "./protocol-version";
import { errorResult } from "../utils/serialize";

/** JSON-RPC 2.0 request shape. */
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC 2.0 response shape. */
type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** Standard JSON-RPC error codes. */
const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INTERNAL_ERROR = -32603;

/**
 * Start the stdio transport loop.
 * Reads from process.stdin, writes to process.stdout.
 * Runs until stdin closes (subprocess exit).
 */
export async function startStdioTransport(server: McpServer): Promise<void> {
  // Buffer for incomplete lines
  let buffer = "";

  process.stdin.setEncoding("utf8");

  const pending = new Set<Promise<void>>();
  const track = (promise: Promise<void>) => {
    pending.add(promise);
    void promise.finally(() => pending.delete(promise));
  };

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    // Last element is an incomplete line (keep in buffer)
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      track(handleLine(trimmed, server));
    }
  });

  process.stdin.on("end", async () => {
    // Process any remaining buffer content, then wait for every in-flight request.
    const trimmed = buffer.trim();
    if (trimmed) track(handleLine(trimmed, server));
    await Promise.all(pending);
    process.exitCode = 0;
  });

  process.stdin.on("error", (err) => {
    process.stderr.write(`stdio transport error: ${err.message}\n`);
    process.exit(1);
  });

  // Keep the process alive
  await new Promise<void>(() => {
    // Resolved by process.exit() in the 'end' handler
  });
}

/** Handle one newline-delimited JSON-RPC message. */
async function handleLine(line: string, server: McpServer): Promise<void> {
  let request: JsonRpcRequest;

  // Parse
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    sendError(null, RPC_PARSE_ERROR, "Parse error");
    return;
  }

  // Validate
  if (!request.method || typeof request.method !== "string") {
    sendError(request.id ?? null, RPC_INVALID_REQUEST, "Invalid Request");
    return;
  }

  const id = request.id ?? null;

  try {
    switch (request.method) {
      case "initialize": {
        // MCP protocol handshake
        sendResult(id, {
          protocolVersion: negotiateProtocolVersion(
            (request.params as { protocolVersion?: unknown } | undefined)?.protocolVersion
          ),
          capabilities: { tools: {} },
          serverInfo: { name: "consologist-mcp", version: "1.0.0" },
        });
        break;
      }

      case "tools/list": {
        const result = await server.handleListTools();
        sendResult(id, result);
        break;
      }

      case "tools/call": {
        const params = request.params ?? {};
        const toolName = params.name as string | undefined;
        const toolArgs = params.arguments as Record<string, unknown> | undefined;

        if (!toolName) {
          sendError(id, RPC_INVALID_REQUEST, "Missing tool name");
          return;
        }

        const result = await server.handleCallTool({
          name: toolName,
          arguments: toolArgs,
        });

        // Map McpToolResult to MCP protocol content format
        if (result.ok) {
          sendResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          });
        } else {
          // Tool-level errors are returned as content (not RPC errors)
          // so the AI agent can read the structured error
          sendResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: true,
          });
        }
        break;
      }

      case "notifications/initialized":
      case "notifications/cancelled": {
        // Notification — no response required
        break;
      }

      case "ping": {
        sendResult(id, {});
        break;
      }

      default: {
        sendError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${request.method}`);
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    // Log to stderr (not stdout — that's reserved for JSON-RPC responses)
    process.stderr.write(`[mcp] unhandled error in ${request.method}: ${msg}\n`);
    sendError(id, RPC_INTERNAL_ERROR, "Internal error");
  }
}

/** Write a JSON-RPC success response to stdout. */
function sendResult(id: string | number | null, result: unknown): void {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
    result,
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

/** Write a JSON-RPC error response to stdout. */
function sendError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): void {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

// Suppress unused import lint — errorResult is available for callers that extend this transport
void errorResult;
