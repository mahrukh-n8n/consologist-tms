# MCP Module — Developer Guide

How to write tools, wire them up, and test them within the portable MCP server architecture.

---

## Architecture in 30 Seconds

```
┌─────────────────────────────────────────────────────────────┐
│  scripts/mcp-server.ts  (subprocess entry)                  │
│  Boot: validate key → register tools → freeze → stdio loop  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  createMcpServer(session, registry, callbacks)              │
│  Dispatch: listTools / callTool(name, args)                 │
│    1. Permission check (permissionChecker)                  │
│    2. Approval routing (approvalRouter) — if needsApproval  │
│    3. Handler execution (tool.handler)                      │
│    4. Audit write (auditWriter)                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  ToolRegistry (singleton-register-freeze)                   │
│  Contains: McpToolDefinition[] — one per registered tool    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  src/lib/mcp/tools/{domain}.ts  (app-side tool families)    │
│  Each tool: { name, description, inputSchema, handler }     │
│  Handler: (ctx: McpToolContext, input) => McpToolResult     │
│  ctx.db is YOUR PrismaClient — full autocomplete            │
└─────────────────────────────────────────────────────────────┘
```

---

## Writing a Tool

### 1. Define the tool

```ts
import { z } from "zod";
import type { McpToolDefinition } from "@/lib/mcp/types";
import { dataResult, commitResult, errorResult } from "@/modules/mcp/utils/serialize";

export const accountListTool: McpToolDefinition = {
  name: "account.list",
  description: "List all accounts",
  inputSchema: z.object({
    filter: z.enum(["all", "active", "archived"]).optional(),
  }),
  requiredPageKey: "accounts",
  accessLevel: "READ",
  async handler(ctx, input) {
    const { filter } = input as { filter?: string };
    const accounts = await ctx.db.account.findMany({
      where: {
        companyId: ctx.companyId,
        ...(filter === "active" ? { archivedAt: null } : {}),
      },
    });
    return dataResult(accounts);
  },
};
```

### 2. Register it

In `src/lib/mcp/tools/{domain}.ts`, export an array:

```ts
export const accountTools: McpToolDefinition[] = [
  accountListTool,
  accountGetTool,
  accountCreateTool,
];
```

In `src/lib/mcp/register-tools.ts`, register the array:

```ts
import { toolRegistry } from "@/modules/mcp";
import { accountTools } from "./tools/accounts";

export function registerMcpTools(): void {
  if (toolRegistry.isFrozen()) return;
  for (const tool of accountTools) toolRegistry.register(tool);
  // ... register all domain families
  toolRegistry.freeze();
}
```

### 3. The handler contract

- **Input** is already Zod-parsed by the dispatch loop — no need to re-validate.
- **ctx.db** is your PrismaClient — use it directly.
- **ctx.userId / ctx.companyId** — always available for scoping.
- **Return** a result helper from `@/modules/mcp/utils/serialize`:

| Helper | Use for |
|--------|---------|
| `dataResult(payload)` | Read tools (list, get) |
| `commitResult(payload)` | Immediate write success |
| `approvalResult(id)` | Handler does NOT call this — framework does it |
| `selectionResult(choices, requirements)` | GUI context step (get_create_context) |
| `resolutionResult(derived, ...)` | After user makes a selection (resolve_*) |
| `previewResult(derived, warnings, blockers)` | Pre-commit preview |
| `errorResult(message, code)` | Structured error |

### 4. Write tools must use the full three-layer orchestration

The gatekeeper alone is not enough. GUI server actions run additional logic **before** calling the gatekeeper (rule engine, preflight checks) and **after** the transaction (post-creation integrity validation). MCP write handlers must call the same orchestration.

```
preflightX(companyId, input)          ← rule engine gate, business checks
  ↓
prisma.$transaction(gatekeeper(...))  ← invariant enforcement + DB write
  ↓
postflightX(result)                   ← post-creation integrity validation
```

These services live in `src/lib/{domain}/{domain}-create-service.ts` and are shared between the GUI server action and the MCP handler:

```ts
// ✅ Correct — MCP handler mirrors the GUI server action
import { preflightJournalCreate, postflightJournalCreate } from "@/lib/journal/journal-create-service";

async handler(ctx, input) {
  await preflightJournalCreate(ctx.companyId, input);
  const je = await ctx.db.$transaction(tx => createJournalEntry(tx, input));
  const validationResults = await postflightJournalCreate(je);
  return commitResult({ je, validationResults });
}

// ❌ Wrong — skips preflight and postflight
async handler(ctx, input) {
  const je = await ctx.db.$transaction(tx => createJournalEntry(tx, input));
  return commitResult({ je });
}

// ❌ Wrong — direct Prisma write
async handler(ctx, input) {
  await ctx.db.purchaseOrder.create({ data: { ... } });
}
```

**How to identify what shared services are needed:** Read the corresponding GUI server action top to bottom. List every call made before the gatekeeper and after the transaction. Those belong in a shared service. If the service doesn't exist, extract it first.

**Never write directly to Prisma in a mutation tool handler.** Wrap an existing domain gatekeeper.

### 4a. Shared query helpers and presenters

Read tools must also use shared helpers — duplicated WHERE clauses and `.map()` presenters are parity drift waiting to happen.

| Shared module | Exports | Use when |
|---|---|---|
| `src/lib/{domain}/{domain}-query.ts` | `buildXWhere`, `X_BASE_INCLUDE` | List/detail queries |
| `src/lib/{domain}/{domain}-presenters.ts` | `deriveXY`, `presentXLines` | Response mapping |
| `src/lib/{domain}/{domain}-create-context.ts` | `getXCreateContext` | `get_create_context` tools |

**Extraction trigger:** If you see the same WHERE builder, include shape, or `.map()` presenter in both a GUI action and an MCP handler — extract immediately.

### 5. Approval is invisible

If the user's permission template has `requiresApproval=true` for the tool's `requiredPageKey`, the dispatch loop **never calls the handler**. It routes to `approvalRouter` instead and returns `approvalResult(pendingApprovalId)`.

Tool handlers only execute on the direct write path (`needsApproval=false`).

---

## Type System — Why Two Type Files?

| File | Location | Purpose |
|------|----------|---------|
| `types.ts` | `@/modules/mcp/types` | Generic base types: `McpToolContext<TDb = unknown>`, `McpToolDefinition<TDb = unknown>`, `McpServerCallbacks<TDb = unknown>` |
| `types.ts` | `@/lib/mcp/types` | Constrained aliases: `McpToolDefinition` = `BaseMcpToolDefinition<PrismaClient>` |

**All tool files import from `@/lib/mcp/types`** — this gives full autocomplete on `ctx.db`. The portable module's generics default to `unknown` so it stays database-agnostic.

**When porting:** create `src/lib/mcp/types.ts` in the new app, constrain `TDb` to your database client.

---

## Testing

### Unit tests (single tool)

```ts
import { describe, it, expect, vi } from "vitest";
import { accountListTool } from "../tools/accounts";
import { createMcpToolRegistry } from "@/modules/mcp/registry/tool-registry";
import { createMcpServer } from "@/modules/mcp/services/create-mcp-server";

describe("account.list", () => {
  it("returns accounts for the company", async () => {
    const mockDb = {
      account: { findMany: vi.fn().mockResolvedValue([{ id: 1, name: "Test" }]) },
    };

    const registry = createMcpToolRegistry();
    registry.register(accountListTool);
    registry.freeze();

    const server = createMcpServer(
      { userId: 1, companyId: 1, requestId: "test" },
      registry,
      {
        db: mockDb as never,
        apiKeyValidator: vi.fn(),
        permissionChecker: vi.fn(async () => undefined),
        approvalRouter: vi.fn(),
        auditWriter: vi.fn(),
      }
    );

    const result = await server.handleCallTool({
      name: "account.list",
      arguments: { filter: "active" },
    });

    expect(result.ok).toBe(true);
    expect(mockDb.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 1 } })
    );
  });
});
```

### Staged workflow tests (context → resolve → preview → commit)

Test each stage independently. Mock the Prisma queries that each stage depends on. Verify the response envelope shape (selection, resolution, preview, commit).

### E2E release gate

The full `release-gate-e2e.test.ts` exercises:
- Authenticated boot with real callback implementations
- Permission-filtered `tools/list`
- Read + write across all domains
- Approval routing
- Write toggle enforcement
- Audit log writes

---

## Staged Dependent Workflows

For GUI-style flows with dependencies (e.g. GRN creation depends on PO → shipment → product selection), use the four-stage pattern:

| Stage | Tool name pattern | Returns |
|-------|-------------------|---------|
| 1. Context | `domain.get_create_context` | `selectionResult` with choices + requirements |
| 2. Resolve | `domain.resolve_{field}` | `resolutionResult` with derived values |
| 3. Preview | `domain.preview_create` | `previewResult` with warnings/blockers |
| 4. Commit | `domain.commit_create` | `commitResult` (or framework routes to approval) |

Each stage is an independent tool with its own `McpToolDefinition`. The dispatch loop calls them sequentially as the client requests each stage.

---

## Common Mistakes

| Mistake | What happens | Fix |
|---------|-------------|-----|
| Import `McpToolDefinition` from `@/modules/mcp/types` | `ctx.db` is `unknown` — no autocomplete | Import from `@/lib/mcp/types` instead |
| Direct Prisma writes in handler | Breaks gatekeeper invariant, bypasses approval | Wrap domain gatekeeper |
| Handler calls gatekeeper but skips preflight/postflight | Rule engine not evaluated, post-validation skipped — silent accounting bug | Extract shared service, call all three layers |
| Duplicate WHERE clause or presenter vs GUI action | Parity drift — MCP and GUI diverge silently | Extract to `{domain}-query.ts` / `{domain}-presenters.ts` |
| Duplicate Zod schemas | Drift between server action and tool input | Reuse the server action's schema |
| Tool name doesn't match `{domain}.{action}` | Registration validation fails | Use consistent naming |
| `requiredPageKey` typo | Permission check fails at runtime | Cross-check against `pageRegistry` |
| Forgot to register tool family | Tool invisible to `tools/list` | Add to `register-tools.ts` |
| Calling `approvalResult` from handler | Approval is framework-driven — handler never sees it | Return `commitResult` for direct path only |
| Shared service imports global `prisma` — not mocked in unit test | Test fails with DB connection error or undefined method | `vi.mock("@/lib/{domain}/{domain}-create-service", ...)` at test file top |
| New shared service calls `db.X.Y()` — not in `mockDb` fixture | `Cannot read properties of undefined (reading 'Y')` | Audit every `db.*` call in the shared service, add to `mockDb` |

---

## Transport Architecture — What Is and Is Not Portable

This is a critical boundary. Read before porting or extending.

### Portable (in `src/modules/mcp/`)

| File | What it does |
|---|---|
| `services/create-mcp-server.ts` | Dispatch loop: permission → approval → handler → audit |
| `services/stdio-transport.ts` | JSON-RPC 2.0 over stdin/stdout |
| `services/http-transport.ts` | JSON-RPC 2.0 protocol adapter for HTTP — returns response objects, no framework code |
| `registry/tool-registry.ts` | Singleton-register-freeze tool registry |
| `utils/serialize.ts` | Result shaping helpers |
| `types.ts` | Generic DI contract types |

**Zero imports from `next/server`, `@/lib/`, `@/app/`, or any app code.** ESLint enforces this.

### App-specific (NOT in `src/modules/mcp/`)

The Next.js route handlers in `src/app/api/mcp/` are framework glue and are NOT portable:

| Route | Method | Purpose |
|---|---|---|
| `/api/mcp` | POST | Main JSON-RPC endpoint — initialize, tools/list, tools/call |
| `/api/mcp` | DELETE | Session termination (MCP spec no-op, JWT expires naturally) |
| `/api/mcp/sse` | GET | SSE keepalive channel — pings only, no tool results |
| `/api/mcp/result/:toolCallId` | GET | Async result polling |
| `/api/mcp/health` | GET | MCP transport health metrics |

### How This App Wires HTTP and SSE

**POST `/api/mcp`** (`src/app/api/mcp/route.ts`):

The route handles the full auth pipeline, then calls into the portable module:

```
Request arrives
  → Brute-force IP check (failedAttemptStore)
  → Parse JSON body
  → If method = "initialize":
      resolveApiKeyByKey() → validate key → generateMcpSessionToken() → return Mcp-Session-Id header
  → All other methods:
      verifyMcpSessionToken(header) → re-validate Bearer key matches session
      → applyMcpRateLimit()
      → createMcpServer(session, toolRegistry, callbacks)
      → handleMcpHttpRequest(body, server)   ← the ONLY call into src/modules/mcp
      → for tools/call: handleAsyncToolCall() — races against 5s timeout
          fast (< 5s): returns result inline
          slow (> 5s): returns { status: "pending", toolCallId }, background promise continues
```

**GET `/api/mcp/sse`** (`src/app/api/mcp/sse/route.ts`):

The SSE endpoint is a keepalive channel — it does NOT carry tool call results.
It uses NO code from `src/modules/mcp/`. It is a plain streaming response:

```
Request arrives
  → Verify Mcp-Session-Id JWT
  → Re-validate Bearer API key matches session (AUTH-04)
  → Open ReadableStream
  → Push "ping" event every 30 seconds
  → Close stream on client disconnect
```

### Porting to a Non-Next.js App

**HTTP transport (Express example):**

```ts
import { handleMcpHttpRequest, httpStatusForRpcError } from "./modules/mcp/services/http-transport";
import { createMcpServer, toolRegistry } from "./modules/mcp";

app.post("/api/mcp", async (req, res) => {
  const session = await yourAuthLogic(req);           // app-specific
  if (!session) return res.status(401).end();

  const server = createMcpServer(session, toolRegistry, callbacks);
  const response = await handleMcpHttpRequest(req.body, server);  // portable module
  res.status(response.error ? httpStatusForRpcError(response.error.code) : 200).json(response);
});
```

**SSE channel (Express example) — no portable module code needed:**

```ts
app.get("/api/mcp/sse", async (req, res) => {
  const session = await yourSessionValidation(req);   // app-specific
  if (!session) return res.status(401).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const interval = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 30_000);
  req.on("close", () => clearInterval(interval));
});
```

The SSE channel is just an HTTP streaming response. It has nothing to do with JSON-RPC or the portable module.

---

## Portability Checklist (for downstream apps)

- [ ] Copy `src/modules/mcp/` to new app
- [ ] Add ESLint `no-restricted-imports` rule on `src/modules/mcp/**`
- [ ] Create `src/lib/mcp/types.ts` — constrain `TDb` to your DB client
- [ ] Create `src/lib/mcp/callbacks.ts` — implement 4 DI callbacks
- [ ] Create `src/lib/mcp/register-tools.ts` — register tool families
- [ ] Create `src/lib/mcp/tools/{domain}.ts` — define tools per domain
- [ ] Create `scripts/mcp-server.ts` — subprocess entry (stdio transport)
- [ ] Implement HTTP route handler for your framework using `handleMcpHttpRequest`
- [ ] Implement SSE route handler for your framework (plain streaming — no module code needed)
- [ ] Implement async result polling endpoint backed by your own result store
- [ ] Run release gate tests
