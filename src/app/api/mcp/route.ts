/**
 * MCP Streamable HTTP endpoint.
 *
 * Same tool registry and gatekeepers as the stdio server (`scripts/mcp-server.ts`);
 * only the transport differs. Clients authenticate with a workspace MCP API key:
 *
 *   POST /api/mcp        JSON-RPC request      (x-api-key: <key>)
 *   GET  /api/mcp        SSE stream            (x-api-key: <key>)
 *   DELETE /api/mcp      end session           (x-api-key + Mcp-Session-Id)
 *
 * Spec rules applied:
 * - JSON-RPC notifications (no `id`, or `notifications/*`) return 202 with an empty body.
 * - `initialize` negotiates `protocolVersion` and returns `Mcp-Session-Id`.
 * - GET is accepted before initialize (key only) so the client can open SSE first.
 */

import { randomUUID } from "node:crypto";
import { getPrisma, runMcpReadOnly } from "@/lib/db";
import { registerMcpTools } from "@/lib/mcp/register-tools";
import { approvalRouter, auditWriter, createApiKeyValidator, permissionChecker } from "@/lib/mcp/callbacks";
import { resolveApiKeyByKey } from "@/lib/mcp/api-key-resolver";
import {
  createMcpServer,
  handleMcpHttpRequest,
  httpStatusForRpcError,
  toolRegistry,
  type JsonRpcRequest,
} from "@/modules/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

registerMcpTools();

type Session = { apiKeyId: number; userId: number; companyId: number; expiresAt: number };
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();

function sweepSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

function rawKeyFrom(request: Request): string | null {
  const header = request.headers.get("x-api-key");
  if (header?.trim()) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

function emptyResponse(status: number, headers?: Record<string, string>) {
  return new Response(null, { status, headers });
}

function rpcResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function isNotification(message: JsonRpcRequest): boolean {
  return message.id === undefined || message.id === null || message.method.startsWith("notifications/");
}

export async function POST(request: Request) {
  const rawKey = rawKeyFrom(request);
  if (!rawKey) return rpcResponse({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Missing MCP API key." } }, 401);

  let message: JsonRpcRequest;
  try {
    const text = await request.text();
    if (!text.trim()) return rpcResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Empty body." } }, 400);
    message = JSON.parse(text) as JsonRpcRequest;
  } catch {
    return rpcResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, 400);
  }

  if (isNotification(message)) return emptyResponse(202);

  const isInitialize = message.method === "initialize";
  const sessionId = request.headers.get("mcp-session-id");
  let session: Session | undefined;

  if (isInitialize) {
    const resolved = await resolveApiKeyByKey(rawKey);
    if (!resolved) {
      return rpcResponse({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32000, message: "Invalid MCP API key." } }, 401);
    }
    session = { ...resolved, expiresAt: Date.now() + SESSION_TTL_MS };
  } else if (sessionId) {
    sweepSessions();
    session = sessions.get(sessionId);
    if (!session) {
      return rpcResponse({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32000, message: "Unknown or expired MCP session." } }, 404);
    }
    const stillValid = await resolveApiKeyByKey(rawKey);
    if (!stillValid || stillValid.apiKeyId !== session.apiKeyId) {
      sessions.delete(sessionId!);
      return rpcResponse({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32000, message: "Invalid MCP API key." } }, 401);
    }
  } else {
    const resolved = await resolveApiKeyByKey(rawKey);
    if (!resolved) {
      return rpcResponse({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32000, message: "Invalid MCP API key." } }, 401);
    }
    session = { ...resolved, expiresAt: Date.now() + SESSION_TTL_MS };
  }

  const db = getPrisma();
  const apiKeyValidator = createApiKeyValidator(db);
  const server = createMcpServer(
    { userId: session.userId, companyId: session.companyId, requestId: randomUUID() },
    toolRegistry,
    {
      db,
      runReadOnlyTool: (_toolName, handler) => runMcpReadOnly(handler),
      apiKeyValidator,
      permissionChecker,
      approvalRouter,
      auditWriter,
    }
  );

  const response = await handleMcpHttpRequest(message, server);

  if (isInitialize) {
    const newSessionId = randomUUID();
    sessions.set(newSessionId, session as Session);
    return rpcResponse(response, 200, { "mcp-session-id": newSessionId });
  }

  return rpcResponse(response, response.error ? httpStatusForRpcError(response.error.code) : 200);
}

export async function GET(request: Request) {
  const rawKey = rawKeyFrom(request);
  if (!rawKey) return emptyResponse(401);

  const resolved = await resolveApiKeyByKey(rawKey);
  if (!resolved) return emptyResponse(401);

  const encoder = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      send("event: connected\ndata: {}\n\n");
      ping = setInterval(() => send("event: ping\ndata: {}\n\n"), 30_000);
      request.signal.addEventListener("abort", () => {
        closed = true;
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "mcp-session-id": request.headers.get("mcp-session-id") ?? "",
    },
  });
}

export async function DELETE(request: Request) {
  const rawKey = rawKeyFrom(request);
  if (!rawKey) return emptyResponse(401);
  const resolved = await resolveApiKeyByKey(rawKey);
  if (!resolved) return emptyResponse(401);
  const sessionId = request.headers.get("mcp-session-id");
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session && session.apiKeyId === resolved.apiKeyId) sessions.delete(sessionId);
  }
  return emptyResponse(204);
}
