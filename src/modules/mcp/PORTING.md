# MCP Module — Porting Guide

This document explains how to copy `src/modules/mcp/` to a new app and wire it end-to-end.

---

## Transport Portability — What Is and Is Not Portable

This is the most important thing to understand before porting. The boundary is sharp.

### Portable: `src/modules/mcp/`

The entire `src/modules/mcp/` folder is portable. Copy it verbatim to any app.

It contains three transports:
- `services/stdio-transport.ts` — JSON-RPC 2.0 over stdin/stdout (subprocess model)
- `services/http-transport.ts` — JSON-RPC 2.0 over HTTP (the protocol adapter)
- `services/create-mcp-server.ts` — the dispatch loop used by both transports

**None of these files import from `next/server`, `@/lib/`, `@/app/`, or any app-specific code.**
The ESLint `no-restricted-imports` rule on `src/modules/mcp/**` enforces this at build time.

You can use them in:
- A Next.js app (as done here)
- An Express / Fastify app
- A standalone Node.js process
- Any app that can run TypeScript / Node.js

### NOT Portable: `src/app/api/mcp/`

The Next.js route handlers are app-specific and are NOT part of the portable module.

```
src/app/api/mcp/
  route.ts              ← POST/DELETE — imports NextRequest, @/lib/mcp/http-auth, rate limiter, etc.
  sse/route.ts          ← GET  — imports NextRequest, @/lib/mcp/http-auth, error tracker, etc.
  health/route.ts       ← GET  — MCP transport health endpoint
  result/[toolCallId]/
    route.ts            ← GET  — async result polling
```

These routes import `next/server` (NextRequest, NextResponse) and many app-specific helpers
from `@/lib/mcp/*`. They are thin framework glue that wires the portable transport adapter
to Next.js. They cannot be copied to a non-Next app as-is — you re-implement this glue
for your framework.

### What This Means for Different Apps

| Your app wants | Can it use `src/modules/mcp/`? | What you must re-implement |
|---|---|---|
| HTTP transport only | Yes — use `http-transport.ts` | HTTP route handler for your framework (Express, Fastify, etc.) |
| SSE only | Yes — SSE is a server-to-client push channel, not a separate transport. The SSE endpoint is a thin Next.js route wrapping a `ReadableStream`. Implement the same stream logic for your framework. | SSE route handler for your framework |
| Both HTTP + SSE | Yes | Both route handlers for your framework |
| Stdio only | Yes — use `stdio-transport.ts` + `scripts/mcp-server.ts` | Just the subprocess entry |

### How This App Uses HTTP and SSE

This app (Consologist Accountant) implements all three endpoints as Next.js route handlers:

**`POST /api/mcp` — All tool calls** (`src/app/api/mcp/route.ts`)

This is the main JSON-RPC endpoint. Every MCP request goes here:

1. `initialize` — client sends API key in `Authorization: Bearer` header. Route validates the key, resolves userId + companyId, generates a JWT session token, returns it in `Mcp-Session-Id` response header.
2. `tools/list` — route verifies JWT session + re-validates the API key still matches the session. Calls `createMcpServer()` → `handleListTools()` via `handleMcpHttpRequest()` from `http-transport.ts`.
3. `tools/call` — same auth. Calls `handleAsyncToolCall()` which races the tool execution against a 5-second timeout. Fast tools return inline; slow tools return `{ status: "pending", toolCallId }` immediately while the original promise continues in the background.
4. `notifications/*` — acknowledged with no response (MCP spec requirement).
5. `DELETE /api/mcp` — session termination. Currently a no-op (JWT expires naturally), but the endpoint exists per the MCP Streamable HTTP spec.

The route imports `handleMcpHttpRequest` from `@/modules/mcp/services/http-transport` — that is the only call into the portable module. Everything else (auth, rate limiting, async store, logging) is app-specific.

**`GET /api/mcp/sse` — Server-to-client push** (`src/app/api/mcp/sse/route.ts`)

This endpoint is for server-initiated events only (pings, keepalives, future progress notifications). It does NOT carry tool call results — those go through the POST endpoint.

The route:
1. Requires `Mcp-Session-Id` header and re-validates the `Authorization: Bearer` API key matches the session (AUTH-04 security check).
2. Creates a `ReadableStream` using Node.js `ReadableStream` API (not `http-transport.ts` — SSE has nothing to do with JSON-RPC).
3. Pushes a `ping` event every 30 seconds to keep the connection alive.
4. Closes when the client disconnects.

The SSE route does NOT use anything from `src/modules/mcp/services/`. It is purely a keepalive channel implemented directly in the Next.js route using the Web Streams API.

**`GET /api/mcp/result/:toolCallId` — Async result polling** (`src/app/api/mcp/result/[toolCallId]/route.ts`)

When `tools/call` returns `{ status: "pending", toolCallId }`, the client polls this endpoint. The route reads from `asyncResultStore` (an in-memory Map with TTL) and returns `pending`, `completed`, or `failed`.

### Implementing HTTP Transport in a Non-Next App

If your app uses Express:

```ts
import express from "express";
import { handleMcpHttpRequest } from "./modules/mcp/services/http-transport";
import { createMcpServer, toolRegistry } from "./modules/mcp";
import type { JsonRpcRequest } from "./modules/mcp/services/http-transport";

const app = express();
app.use(express.json());

app.post("/api/mcp", async (req, res) => {
  // YOUR auth logic here (validate API key, resolve session)
  const session = await validateApiKey(req.headers.authorization);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const server = createMcpServer(session, toolRegistry, callbacks);
  const response = await handleMcpHttpRequest(req.body as JsonRpcRequest, server);

  const status = response.error ? httpStatusForRpcError(response.error.code) : 200;
  res.status(status).json(response);
});
```

The portable module provides `handleMcpHttpRequest` and `httpStatusForRpcError`. Your app provides auth, rate limiting, and the HTTP server framework.

### Implementing SSE in a Non-Next App

The SSE channel uses no portable module code. Implement it directly:

```ts
app.get("/api/mcp/sse", async (req, res) => {
  // YOUR auth logic
  const session = await validateSession(req.headers["mcp-session-id"]);
  if (!session) return res.status(401).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 30_000);

  req.on("close", () => clearInterval(interval));
});
```

No import from `src/modules/mcp/` is needed for SSE. It is a plain HTTP streaming response.

---

## Module Boundary

```
src/modules/mcp/          ← PORTABLE — copy this to any app
  types.ts                   Core types, DI contracts, response envelope (generic TDb)
  client.ts                  Client-safe barrel (types only — no Prisma runtime)
  index.ts                   Server barrel (full contract)
  registry/
    tool-registry.ts         ToolRegistry singleton-register-freeze
  services/
    create-mcp-server.ts     Dispatch loop (permission → approval → handler → audit)
    stdio-transport.ts       JSON-RPC 2.0 stdio transport
  utils/
    serialize.ts             serializeDeep + result shaping helpers
  models/
    response-types.ts        App-specific serializable response shapes (recreate per app)

src/lib/mcp/              ← APP-SPECIFIC — implement per app
  types.ts                 Constrained type aliases: `McpToolDefinition` = `BaseMcpToolDefinition<YourPrismaClient>`
  callbacks.ts               App implementations of DI callbacks
  register-tools.ts          Single tool registration file (the ONLY place that calls toolRegistry.register())
  tools/
    {domain}.ts              Domain tool families — one file per domain

scripts/
  mcp-server.ts             ← SUBPROCESS ENTRY — implement per app
```

**Rule:** `src/modules/mcp/**` must never import from `src/lib/`, `src/app/`, `src/components/`, `next/*`, or `server-only`. An ESLint `no-restricted-imports` rule enforces this at build time.

---

## Subprocess Boundary

The subprocess (`scripts/mcp-server.ts`) runs outside the Next.js runtime. Forbidden inside `src/modules/mcp/**` and all its transitive imports:
- `next/headers`, `cookies()`, `headers()` — no Next.js App Router primitives
- `server-only` — not a Next.js module
- Runtime Prisma imports — type imports (`import type`) are fine (TS-erased)

The subprocess receives a database client via the DI callback contract. It never constructs one directly.

> **Generic DB contract:** `McpToolContext<TDb>`, `McpToolDefinition<TDb>`, and `McpServerCallbacks<TDb>` all default to `TDb = unknown`. The portable module never inspects or calls methods on `db` — it's pure plumbing. App-side code creates a small `src/lib/mcp/types.ts` that constrains `TDb` to the real client (e.g. `PrismaClient`), so all tool files retain full autocomplete. When porting to a new app, create the same `types.ts` file with your database client.

---

## GUI–MCP Parity Law

Every business-rule gate, query filter, and data presenter that exists on a GUI path MUST be shared with the MCP path for the same entity. Drift between them is a silent accounting bug — the AI agent may accept data the GUI would have rejected, or present computed fields the GUI computes differently.

### Three categories of shared code

**1. Write orchestration (write tools)**

The gatekeeper alone is not enough. GUI server actions run logic before (rule engine, preflight) and after (post-validation) the transaction. MCP write handlers must call the same services:

```
src/lib/{domain}/{domain}-create-service.ts
  → preflightX(companyId, input)     ← called before prisma.$transaction
  → postflightX(result)              ← called after prisma.$transaction
```

Both the GUI server action and the MCP handler import and call these. If you add a new write tool and no shared service file exists for the domain, read the GUI server action top-to-bottom and extract one.

**2. Create-context loaders (`get_create_context` tools)**

```
src/lib/{domain}/{domain}-create-context.ts
  → getXCreateContext(db, companyId) ← called by GUI page load + MCP get_create_context handler
```

Never inline `prisma.X.findMany(...)` for reference data in either a GUI page or an MCP handler.

**3. Query helpers and presenters (read tools)**

```
src/lib/{domain}/{domain}-query.ts       → buildXWhere, X_BASE_INCLUDE
src/lib/{domain}/{domain}-presenters.ts  → deriveXY, presentXLines
```

Extraction trigger: the moment the same WHERE builder, include shape, or `.map()` presenter appears in both a GUI action and an MCP handler — extract immediately.

### Parity verification checklist (run before marking any MCP work done)

- [ ] GUI write path pre-/post-gatekeeper orchestration → same orchestration called by MCP handler?
- [ ] GUI create-context query → same shared loader called by MCP `get_create_context`?
- [ ] GUI list WHERE clause → same `buildXWhere` function used by MCP list handler?
- [ ] GUI list/detail presenter → same `presentX` function used by MCP handler?
- [ ] GUI detail computed fields → same shared loader?
- [ ] MCP write handler: calls `preflightX` → gatekeeper → `postflightX`? All three present?

---

## Step 1: Copy the Module

```bash
cp -r src/modules/mcp/ /path/to/new-app/src/modules/mcp/
```

Then add the ESLint `no-restricted-imports` rule (see `eslint.config.mjs` for the exact config).

---

## Step 2: Create Constrained Type Aliases

Create `src/lib/mcp/types.ts`. This is the **single place** in your app that constrains the portable module's generic types to your database client:

```ts
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  McpToolContext as BaseMcpToolContext,
  McpToolDefinition as BaseMcpToolDefinition,
  McpServerCallbacks as BaseMcpServerCallbacks,
} from "@/modules/mcp/types";

export type McpToolContext = BaseMcpToolContext<PrismaClient>;
export type McpToolDefinition = BaseMcpToolDefinition<PrismaClient>;
export type McpServerCallbacks = BaseMcpServerCallbacks<PrismaClient>;

// Re-export everything else unchanged
export type {
  McpSessionContext,
  McpAccessLevel,
  McpToolResult,
  // ... etc.
} from "@/modules/mcp/types";
```

All tool files import `McpToolDefinition` and `McpServerCallbacks` from **this file**, not from the portable module. This keeps autocomplete working while the portable module stays database-agnostic.

## Step 3: Implement the Four DI Callbacks

Create `src/lib/mcp/callbacks.ts` with app-side implementations. These are the **single bridge** between the portable module and your app's auth-rbac, approval, and audit systems:

| Callback | Responsibility | App systems it adapts |
|---|---|---|
| `createApiKeyValidator` | Validates raw key + companyId at subprocess startup. bcrypt-compare against stored `keyHash`, confirm user belongs to company, fire-and-forget `lastUsedAt` update. | `McpApiKey` table, `UserCompanyRole` |
| `createPermissionChecker` | READ: calls `requirePageAccess`. WRITE: checks `mcpWritesEnabled` for every role, then calls `requireWriteGate` unless SUPER_ADMIN bypasses page approval. | `requirePageAccess`, `requireWriteGate`, user `mcpWritesEnabled` flag |
| `createApprovalRouter` | Creates `PendingApproval` when `needsApproval=true`. Looks up `entityType` from `PAGE_ENTITY_MAP` using the tool's `requiredPageKey` (the single trusted source). | `submitForApproval`, `getEntityTypeForPage` |
| `createAuditWriter` | Writes every tool invocation to the audit log with `source: "mcp"`, status, duration, args, and error/result detail. | `AuditLog` table |

```ts
import type {
  McpApiKeyValidator,
  McpPermissionChecker,
  McpApprovalRouter,
  McpAuditWriter,
} from "@/modules/mcp/types";

// 1. apiKeyValidator — validates raw key + companyId at subprocess startup
export function createApiKeyValidator(db: PrismaClient): McpApiKeyValidator {
  return async (rawKey, companyId) => {
    // bcrypt-compare against stored keyHash
    // confirm user belongs to company
    // update lastUsedAt (fire-and-forget)
    return { userId, companyId };
  };
}

// 2. permissionChecker — enforces page-level access + MCP write toggle
export function createPermissionChecker(db: PrismaClient): McpPermissionChecker {
  return async (userId, companyId, pageKey, level) => {
    if (level === "READ") {
      await requirePageAccess(userId, companyId, pageKey);
      return;
    }
    // Check write toggle — throw if disabled
    // return { needsApproval } from requireWriteGate(...)
  };
}

// 3. approvalRouter — creates PendingApproval when needsApproval=true
export function createApprovalRouter(): McpApprovalRouter {
  return async (userId, companyId, requiredPageKey, toolName, validatedInput) => {
    // submitForApproval({ companyId, entityType: pageEntityMap[requiredPageKey], pageKey: requiredPageKey, payload: validatedInput, ... })
    return { pendingApprovalId };
  };
}

// 4. auditWriter — writes tool invocation to audit log
export function createAuditWriter(db: PrismaClient): McpAuditWriter {
  return async (entry) => {
    // db.auditLog.create({ data: { source: "mcp", ... } })
  };
}
```

---

## Step 4: Register Tools

Create `src/lib/mcp/register-tools.ts`. This is the **ONLY** file that calls `toolRegistry.register()`. Import tool families from `src/lib/mcp/tools/{domain}.ts` and register them:

```ts
import { toolRegistry } from "@/modules/mcp";
import { accountTools } from "./tools/accounts";
import { purchaseOrderReadTools } from "./tools/purchase-orders-read";
// ... more domain families

export function registerMcpTools(): void {
  if (toolRegistry.isFrozen()) return;
  for (const tool of accountTools) toolRegistry.register(tool);
  for (const tool of purchaseOrderReadTools) toolRegistry.register(tool);
  // ... register all families

  // Validate all tool pageKeys are registered
  // toolRegistry.freeze()
}
```

Registration validates:
- Tool names match `{domain}.{action}` regex
- No duplicate names
- Every `requiredPageKey` exists in `pageRegistry` (unknown pageKeys crash boot)

---

## Step 5: Write the Subprocess Entry

Create `scripts/mcp-server.ts`:

```ts
import "dotenv/config";
import { randomUUID } from "crypto";
import { getPrisma } from "@/lib/db";
import { toolRegistry, createMcpServer, startStdioTransport } from "@/modules/mcp";
import { registerMcpTools } from "@/lib/mcp/register-tools";
import { createApiKeyValidator, createPermissionChecker, createApprovalRouter, createAuditWriter } from "@/lib/mcp/callbacks";

async function boot() {
  const rawKey = process.env.MCP_API_KEY ?? "";
  const companyId = parseInt(process.env.MCP_COMPANY_ID ?? "", 10);

  const db = getPrisma();
  const session = await createApiKeyValidator(db)(rawKey, companyId);

  registerMcpTools();

  const mcpServer = createMcpServer(
    { ...session, requestId: randomUUID() },
    toolRegistry,
    { db, apiKeyValidator: createApiKeyValidator(db), permissionChecker: createPermissionChecker(db), approvalRouter: createApprovalRouter(), auditWriter: createAuditWriter(db) }
  );

  await startStdioTransport(mcpServer);
}

boot().catch((err) => { process.stderr.write(`[mcp] Fatal: ${err.message}\n`); process.exit(1); });
```

---

## Tool Definition Shape

```ts
const myTool: McpToolDefinition = {
  name: "domain.action",           // {domain}.{action} — validated at registration
  description: "...",
  inputSchema: myZodSchema,        // REUSE the server action's existing Zod schema
  requiredPageKey: "page-key",     // pageRegistry key from the web app
  accessLevel: "READ" | "WRITE",
  async handler(ctx, input) {
    // ctx.db  — PrismaClient
    // ctx.userId, ctx.companyId — boot-scoped session
    // input   — already Zod-parsed
    // Return a result helper:
    return dataResult({ ... });    // for reads
    return commitResult({ ... });  // for writes (immediate path only)
    // Approval and audit are framework-driven — never call them from handlers
  }
};
```

**Result helpers** (all from `@/modules/mcp/utils/serialize`):
- `dataResult(payload)` — plain read
- `selectionResult(choices, requirements?)` — context/choices step
- `resolutionResult(derived, choices?, requirements?)` — after upstream selection
- `previewResult(derived, warnings?, blockers?)` — pre-commit preview
- `commitResult(payload)` — immediate write success
- `approvalResult(pendingApprovalId)` — framework uses this automatically; handlers don't call it
- `errorResult(message, code)` — structured error

---

## Staged Dependent Workflows (get_create_context → resolve_* → preview_* → commit)

GUI-style flows with dependencies (e.g. GRN creation that depends on PO → shipment → product selection) use a **staged interaction family** of tools:

```
domain.get_create_context   → selectionResult  (returns choices: pos, shipments, etc.)
domain.resolve_{field}      → resolutionResult (derives values after a selection)
domain.preview_create       → previewResult    (shows consequences + warnings)
domain.commit_create        → commitResult     (final write — framework handles approval)
```

**Where does the domain-specific dependency logic live?**
- The **portable module** (`src/modules/mcp/`) defines the result shapes and helper functions.
- The **app-side tools** (`src/lib/mcp/tools/{domain}.ts`) implement the dependency resolution queries (which Prisma models to query, how to derive values, what blockers to check).
- The portable module never knows which models a dependency query reads — that is always app-side.

**Example skeleton** (`src/lib/mcp/tools/grn.ts`):

```ts
export const grnGetCreateContextTool: McpToolDefinition = {
  name: "grn.get_create_context",
  accessLevel: "READ",
  requiredPageKey: "goods-receipts",
  handler: async (ctx, input) => {
    const pos = await ctx.db.purchaseOrder.findMany({ where: { companyId: ctx.companyId, status: "IN_TRANSIT" }, select: { id: true, poNumber: true } });
    return selectionResult(
      { purchaseOrders: pos.map(p => ({ id: p.id, label: p.poNumber })) },
      [{ field: "purchaseOrderId", label: "Purchase Order", description: "Select the PO this GRN is for" }]
    );
  }
};

export const grnResolvePo: McpToolDefinition = {
  name: "grn.resolve_po",
  accessLevel: "READ",
  requiredPageKey: "goods-receipts",
  handler: async (ctx, input) => {
    // query shipments + products for the selected PO
    return resolutionResult({ shipments: [...], products: [...] });
  }
};

export const grnPreviewCreate: McpToolDefinition = { name: "grn.preview_create", ... };
export const grnCommitCreate: McpToolDefinition = { name: "grn.commit_create", ... };
```

This pattern keeps the portable module clean while allowing full GUI-equivalent expressiveness app-side.

---

## Approval Branch (Framework-Driven)

Approval is invisible to tool definitions. The dispatch loop handles it:

1. WRITE tool invoked
2. `permissionChecker` returns `{ needsApproval: true }`
3. Framework calls `approvalRouter(userId, companyId, requiredPageKey, toolName, validatedInput)` -> creates `PendingApproval`
4. Framework returns `approvalResult(pendingApprovalId)` → handler is NOT called
5. Reviewer approves in the web app → handler's same gatekeeper is called with deserialized payload

Tool handlers only execute on the direct path (needsApproval=false). They never see or branch on approval.

---

## Generated Documentation & Parity Matrix

The live tool registry is the single source of truth. A generator script (`scripts/generate-mcp-release-docs.ts`) boots the registry via `registerMcpTools()`, reads `toolRegistry.all()`, and emits:

- `.planning/mcp-parity-matrix.md` — parity matrix showing registered vs deferred tools
- `docs/htmldocs/mcp-server.html` — operator-facing setup guide with live tool reference

**No hand-maintained tool reference tables.** The parity matrix and docs page are generated from the live registry, so they cannot drift from the actual registered surface. Re-run the generator after adding or removing tool families.

---

## Release Verification

The release-gate harness (`src/lib/mcp/__tests__/release-gate-e2e.test.ts`) proves the core end-to-end lifecycle through the **real** boot/session/callback/dispatch path — not isolated tool unit tests:

- Valid authenticated boot (same session/config shape as `scripts/mcp-server.ts`)
- Permission-filtered `tools/list` (READ_ONLY vs READ_WRITE visibility)
- Read call through the final registry surface
- Write call through the final registry surface
- Maker-with-approval mutation returning `pendingApprovalId`
- SUPER_ADMIN bypass behavior
- Write toggle OFF failure then ON success
- Audit log writes with `source="mcp"` for success, error, and pending-approval outcomes

The boot-auth test harness (`src/lib/mcp/__tests__/mcp-boot-auth.test.ts`) proves subprocess authentication failures produce clear stderr-visible error text and records cold-start / first-call latency baselines.

---

## Claude Desktop Config

```json
{
  "mcpServers": {
    "consologist": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "cwd": "/path/to/app",
      "env": {
        "DATABASE_URL": "postgresql://...",
        "MCP_API_KEY": "<raw key from Settings → API Keys>",
        "MCP_COMPANY_ID": "123"
      }
    }
  }
}
```

Generate the API key from **Settings → API Keys** in the web app. The raw key is shown exactly once at creation.
