# MCP Module Rules

## Module Location
`src/modules/mcp/` — zero runtime imports from app business logic. Extractable by copy.

## Barrel Boundary (CRITICAL)

Two entry points exist. Never mix them up.

| Entry Point | Safe In | Exports |
|---|---|---|
| `@/modules/mcp/client` | `"use client"` components (API key UI, admin pages) | Types only: `McpTool`, `ToolDefinition`, `SessionContext`, `McpApiKeyRecord`, `ToolInvocationStatus` |
| `@/modules/mcp` (index.ts) | Server components, server actions, subprocess entry | Everything above + `ToolRegistry`, `createMcpServer`, `createMcpToolRegistry` |

**Rule:** Any `"use client"` file that needs MCP types must import from `@/modules/mcp/client` — never from the root barrel.

## Subprocess Boundary (CRITICAL — different from auth-rbac/backup)

Unlike auth-rbac and backup, the MCP module runs as a **subprocess** (`scripts/mcp-server.ts`) spawned by Claude Desktop over stdio. This adds a second import constraint on top of the client/server barrel boundary:

**Forbidden in `src/modules/mcp/**` and all its transitive imports:**
- `next/headers` — crashes the subprocess (no Next.js runtime)
- `server-only` — subprocess is not a Next.js app
- `cookies()` — same
- Any Next.js built-in or App Router primitive
- Runtime Prisma imports (type imports are allowed — TS-erased)

**Enforced by:** ESLint `no-restricted-imports` rule on `src/modules/mcp/**` forbidding `@/lib/`, `@/app/`, `@/components/`, `next/*`, and `server-only`. This rule is set up in Phase 64 and must not be removed.

**Diagnosis:** If the subprocess crashes with "Cannot find module 'next/headers'" or similar, a new transitive import has violated this rule. Trace the import chain back to `src/modules/mcp/**`.

**Type imports from `@/generated/prisma/client` ARE allowed** (TS erases them). The `db: PrismaClient` parameter is always typed via this import. Runtime Prisma usage flows through the injected `db` — never imported directly inside the module.

## ToolRegistry Pattern

Same singleton-register-freeze pattern as `pageRegistry` (auth-rbac) and `dataSourceRegistry` (backup).

```ts
import { createMcpToolRegistry } from "@/modules/mcp";

const toolRegistry = createMcpToolRegistry();
// register phase
toolRegistry.register({ name: "account.list", ... });
toolRegistry.register({ name: "po.create", ... });
// freeze — no further registration allowed
toolRegistry.freeze();
```

- Duplicate tool name throws at registration time (fail loud, dev time)
- Tool names validated against `{domain}.{action}` regex at registration — typos fail immediately
- `requiredPageKey` validated against the app's `pageRegistry` at freeze time — unknown page keys throw
- After `freeze()`, `toolRegistry.all()` returns a read-only list for `tools/list` filtering

## Tool Definition Shape (the contract)

```ts
type ToolDefinition = {
  name: string;                      // "{domain}.{action}" — e.g. "po.create"
  description: string;               // User-facing, appears in Claude's tool list
  inputSchema: ZodSchema;            // Reused from existing server action Zod schema
  requiredPageKey: string;           // pageRegistry key — e.g. "purchase-orders"
  accessLevel: "READ" | "WRITE";     // READ uses requirePageAccess; WRITE uses requireWriteGate
  handler: (ctx: ToolContext, input: unknown) => Promise<ToolResult>;
};

type ToolContext = {
  db: PrismaClient;
  userId: number;
  companyId: number;
  requestId: string;
};
```

- `inputSchema` must be the **same Zod schema** already used by the server action — never define a second schema for the same operation
- `handler` receives already-parsed input (module pre-validates before calling handler)
- Handlers must never import from `@/lib/`, `@/app/`, or `@/components/` — they live in `src/lib/mcp/tools/{domain}/` (app-side)

## Dependency Injection Contract

The portable module accepts all app-specific behavior via callbacks. No concrete app logic lives inside `src/modules/mcp/`:

```ts
createMcpServer({
  db,               // PrismaClient — injected by subprocess entry
  toolRegistry,     // frozen ToolRegistry — injected by subprocess entry
  apiKeyValidator,  // (rawKey, companyId) => Promise<{ userId, companyId }> — app-side
  permissionChecker,// (userId, companyId, pageKey, level) => Promise<void> — app-side, wraps requirePageAccess/requireWriteGate
  approvalRouter,   // (gate, toolName, input) => Promise<{ pendingApprovalId }> — app-side, wraps submitForApprovalIfNeeded
  auditWriter,      // (entry: AuditEntry) => Promise<void> — app-side, writes to WriteAuditLog
});
```

App-side implementations live in `src/lib/mcp/callbacks.ts`. Never implement these inside `src/modules/mcp/`.

## Streamable HTTP Spec Compliance (CRITICAL for remote transport)

The HTTP transport at `src/app/api/mcp/route.ts` must follow the MCP Streamable HTTP spec exactly. Non-compliant responses cause clients (Claude Code, Claude Desktop) to abort the handshake with an unhelpful "Failed to reconnect" — no useful error surfaces.

### Rule 1: JSON-RPC Notifications → HTTP 202, empty body

Any request with no `id` field, or a method starting with `notifications/` (e.g. `notifications/initialized`, `notifications/cancelled`), is a **notification**. The server MUST:
- Return **HTTP 202 Accepted**
- Send **empty body** (no JSON-RPC response — not even `{"result":null}`)

Returning `200 + {"jsonrpc":"2.0","id":null,"result":null}` for a notification is a spec violation and breaks the handshake. Detect notifications at the top of the POST handler, before dispatch.

### Rule 2: `initialize` must negotiate `protocolVersion`

The `initialize` response must echo the client's requested `protocolVersion` if supported, not hardcode a value. Maintain an explicit supported-versions list (currently `2025-06-18`, `2025-03-26`, `2024-11-05`). If the client requests an unsupported version, fall back to the server's latest supported. Never silently downgrade — clients may treat mismatch as handshake failure.

### Rule 3: GET must accept pre-initialize requests

The MCP client may open the SSE channel via GET **before** `initialize` (no `Mcp-Session-Id` yet). The GET handler must:
- Accept GET with API key only (no session) → validate key exists, open SSE stream
- Accept GET with API key + session → validate both match, open SSE stream
- Return `text/event-stream` with initial `event: connected` and a 30s ping

Returning 405 or 401 for the pre-initialize GET breaks the handshake.

## Stdio Auth Model

API key and company context are resolved **once at subprocess startup** — not per request.

```ts
// scripts/mcp-server.ts
const rawKey = process.env.MCP_API_KEY;
const companyId = Number(process.env.MCP_COMPANY_ID);
const session = await apiKeyValidator(rawKey, companyId);
// session = { userId, companyId } — held for lifetime of subprocess
```

- **No per-request HTTP headers** (`x-api-key`, `x-company-id` do not exist in this architecture)
- Subprocess fails fast at boot if key is invalid, revoked, or company mismatch — clear error, no zombie process
- `session` is passed into every `ToolContext` — tools never re-validate auth

## Registration Pattern (App Bridge)

All tool implementations live in `src/lib/mcp/tools/{domain}/` and are registered in `src/lib/mcp/register-tools.ts`. This file is the sole bridge between the portable module and domain gatekeepers.

```
src/lib/mcp/
  register-tools.ts       ← single registration file, analogous to register-sources.ts
  callbacks.ts            ← app-side implementations of DI callbacks
  tools/
    purchase-orders.ts    ← po.* tools — wraps PO gatekeepers
    shipments.ts          ← shipment.* tools — wraps shipment gatekeepers
    journal.ts            ← journal.* tools — wraps createJournalEntry
    accounts.ts           ← account.* tools
    ...
```

`register-tools.ts` must call `registerMcpTools()` at module scope in the subprocess entry — same pattern as `registerBackupSources()` in backup server actions.

```ts
// scripts/mcp-server.ts (at module scope — before createMcpServer)
import { registerMcpTools } from "@/lib/mcp/register-tools";
registerMcpTools(); // idempotent — guarded by isFrozen() check
```

## GUI–MCP Parity Law (CRITICAL — applies to every domain)

**The law:** Every business-rule gate, query filter, and data presenter that exists on a GUI path MUST be shared with the MCP path for the same entity. Drift between them is a silent accounting bug — the AI agent may accept or present data the GUI would have rejected.

### Three categories of shared code

#### 1. Business-rule orchestration (write paths)

The gatekeeper alone is not enough. GUI server actions run additional orchestration before and after the transaction. The MCP handler for the same operation MUST call the same orchestration.

| Orchestration layer | Where it lives | Called by |
|---|---|---|
| Pre-creation rule engine gate | `src/lib/journal/journal-create-service.ts` → `preflightJournalCreate` | GUI `journal/actions.ts` + MCP `journal-write.ts` |
| Post-creation integrity validation | `src/lib/journal/journal-create-service.ts` → `postflightJournalCreate` | GUI `journal/actions.ts` + MCP `journal-write.ts` |
| Purchase Entry inventory-only gate | `src/lib/mutations/purchase-entry.ts` → `gkCreatePurchaseEntry` | GUI `journal/purchase/actions.ts` + MCP `purchase.create_entry` |

**Pattern for new write tools:**
1. Identify what the GUI server action does BEFORE calling the gatekeeper (rule engines, preflight checks)
2. Identify what it does AFTER the transaction (post-validation, derived side-effects)
3. Extract both into a `src/lib/{domain}/{domain}-create-service.ts` file
4. Import and call from both GUI action and MCP handler

**If no orchestration helper exists yet for a domain, do not duplicate validation across the GUI action and MCP handler — extract the domain mutation into a `src/lib/mutations/{domain}.ts` gatekeeper and call it from both.** Example: `purchase.create_entry` previously had inline `tx.batch.create` calls in both the GUI action and MCP handler with only an existence check on the inventory account, letting a non-inventory expense account slip through and auto-create a malformed DRAFT batch. The fix was to extract `gkCreatePurchaseEntry` (`src/lib/mutations/purchase-entry.ts`) which enforces the inventory-subtype constraint (`SUBTYPE.INVENTORY` and `isClearing === false`) and routes single vs. compound JEs through the journal gatekeeper. Both paths now call the same gatekeeper inside a Prisma transaction.

#### 2. Reference data loaders (create-context)

Any `get_create_context` tool that returns reference data for a mutation **must** call a shared loader in `src/lib/{domain}/{domain}-create-context.ts`. The GUI page that loads the same form data must call the same loader.

- Never inline a `prisma.X.findMany({...})` for "reference data needed to create an entity" inside an MCP handler OR a GUI page. Extract it to a shared loader.
- Never use string literals for account subtypes — import from `SUBTYPE` in `@/lib/accounts/account-filter`.
- Never use string literals for PO status filters — import from `@/lib/purchase-orders/po-eligibility`.
- Never use generator functions (e.g. `generatePONumber`) inline in an MCP handler — always call the same shared generator the GUI uses.

**Existing shared loaders:**
- `src/lib/grn/grn-create-context.ts` — `getGrnCreateContext(db, companyId)` — GRN form + `grn.get_create_context`
- `src/lib/shipments/shipment-create-context.ts` — `getShipmentCreateContext(db, companyId)` — shipment form + `shipment.get_create_context`

#### 3. Query filters, includes, and presenters (read paths)

Duplicated WHERE clauses and response-shape mappings are parity drift waiting to happen. Extract to shared modules the moment the same logic appears in both a GUI action and an MCP handler.

| Shared module | Exports | Callers |
|---|---|---|
| `src/lib/accounts/account-query.ts` | `buildAccountWhere`, `ACCOUNT_BASE_INCLUDE` | `accounts/actions.ts` + `mcp/tools/accounts.ts` |
| `src/lib/accounts/account-balance-query.ts` | `computeAccountBalances` | `accounts/actions.ts` + `mcp/tools/accounts.ts` |
| `src/lib/grn/grn-presenters.ts` | `deriveGrnDestination`, `presentGrnLines` | `goods-receipt/actions.ts` + `mcp/tools/grn-read.ts` |
| `src/lib/fbm-orders/fbm-detail-loader.ts` | `computeFbmDetailFields` | `record-sale/[id]/page.tsx` + `mcp/tools/commercial-master-read.ts` |
| `src/lib/fbm-orders/` (index) | `buildFbmWhere`, `presentFbmList` | `record-sale/page.tsx` + `mcp/tools/commercial-master-read.ts` |
| `src/lib/purchase-orders/po-list-query.ts` | `buildPoWhere`, `presentPoList` | PO GUI page + `mcp/tools/purchase-orders-read.ts` |
| `src/lib/shipments/shipment-list-query.ts` | `buildShipmentWhere`, `presentShipmentList` | Shipment GUI page + `mcp/tools/shipments-read.ts` |
| `src/lib/journal/journal-list-query.ts` | `buildJournalWhere`, `JOURNAL_LIST_SELECT` | `journal/actions.ts` + `mcp/tools/journal-read.ts` |

**Extraction trigger:** If you see the same `where` builder, `include`/`select` shape, or `.map()` presenter in both a GUI server action and an MCP tool handler → stop and extract immediately before adding more callers.

### Parity verification checklist (run before marking any MCP work done)

For each domain touched:
- [ ] GUI write path pre-/post-gatekeeper orchestration → same orchestration called by MCP handler?
- [ ] GUI create-context query → same shared loader called by MCP `get_create_context`?
- [ ] GUI list WHERE clause → same `buildXWhere` function used by MCP list handler?
- [ ] GUI list/detail presenter → same `presentX` function used by MCP handler?
- [ ] GUI detail computed fields (AC costs, clearing account checks) → same shared loader?
- [ ] MCP write handler: calls `preflightX` → gatekeeper → `postflightX`? All three steps present?

## New Feature Checklist (CRITICAL — Stays Current)

When you add a new domain feature (new server action, new gatekeeper, new page), the MCP layer does **not** auto-update. You must manually extend it:

1. **Gatekeeper exists?** — If the new feature calls a domain gatekeeper, an MCP tool should wrap it. No exceptions for "it's too complex" — simplify the tool's scope instead.
2. **Add tool implementation** — create `src/lib/mcp/tools/{domain}.ts` (or add to existing file) wrapping the gatekeeper. Reuse the existing server action Zod schema as `inputSchema`.
3. **Register it** — add `toolRegistry.register({...})` line in `register-tools.ts`.
4. **Set `requiredPageKey`** — use the exact pageKey from `pageRegistry` that the web feature uses. If uncertain, grep `requirePageWrite(` in the corresponding server action.
5. **Set `accessLevel`** — READ for queries, WRITE for mutations (mirrors `requirePageAccess` vs `requireWriteGate`).
6. **Parity matrix** — the matrix auto-generates from the live registry. Run it to verify the new tool appears.
7. **Do NOT** duplicate gatekeeper validation in the handler — account subtype checks, balance equations, status transition guards all live in the gatekeeper. The handler calls the gatekeeper and returns the result.
8. **Do NOT** add direct Prisma writes in handlers. Every handler ends in a gatekeeper call, never a raw `db.model.create(...)`.

## Parity Matrix

The parity matrix is generated from the live `toolRegistry` and diffs against the expected tool list derived from page definitions. It is the equivalent of `validate-sources.ts` for backup.

- Generated at dev startup after `freeze()` in development mode
- Every entry is either: registered tool ✓ OR explicit "deferred to v7.0+" entry with reason
- A missing tool without a deferral entry is a **startup warning** (not a crash — missing tools don't break existing tools)
- Run manually: `npx tsx scripts/generate-mcp-release-docs.ts`

## Serialization Rules

All handler responses must serialize types that don't cross JSON cleanly:

| Type | Serialization |
|---|---|
| `Decimal` | `.toString()` |
| `BigInt` | `.toString()` |
| `Date` | `.toISOString()` |
| `null` | `null` (pass through) |
| `undefined` | omit the field |

Never return raw Prisma model objects — always map to a typed response shape that applies these conversions. Same discipline as server actions returning to the client.

## MCP Writes Toggle

Every mutation handler must check the write toggle before calling the gatekeeper:

```ts
// This check runs inside the module's dispatch loop — handlers do NOT need to check it themselves
// The module calls permissionChecker which includes the write-toggle gate
// Handlers only run when the toggle is ON and permissions pass
```

The write toggle is enforced by the `permissionChecker` callback (app-side) — not duplicated per handler.

The write toggle applies to SUPER_ADMIN too; that role bypasses page approval, not the MCP safety switch. READ handlers receive a restricted Prisma client that permits only read operations, including reads inside callback transactions. The app also scopes shared Prisma access during READ handler execution, so helper calls cannot write through the global client. Only parameterized SELECT queries are allowed through `$queryRaw`; unsafe raw queries, non-SELECT statements and array transactions are blocked. `fx.fetch_rate` is the sole scoped exception: a cache miss may store the fetched rate. Keep this exception narrow; never add business mutations to that tool.

### Database access in READ handlers

Pass `toolCtx.db` through every database-backed helper used by a READ handler, including review, reconciliation, configuration and export helpers. Use the authenticated company ID in model queries and parameterized SQL. A helper shared with the GUI may construct its GUI client only when the caller has supplied no client. Calling `createScopedPrisma` or `$extends` during a READ request triggers `PERMISSION_DENIED`.

Cover the affected handler under the real READ guard. For run-dependent reads, exercise both a mutable run and a finalized snapshot when their paths differ. For downloads, verify that the returned bytes open in the advertised format.

## Approval Flow in Handlers

Mutation handlers never branch on `needsApproval` themselves. The module's dispatch loop handles this:

1. Module calls `permissionChecker(userId, companyId, pageKey, "WRITE")` → gets `WriteGate`
2. If `gate.needsApproval` → module calls `approvalRouter(gate, toolName, validatedInput)` → returns `{ pendingApprovalId }` → tool response is "submitted for approval" without calling the handler
3. If `gate.needsApproval=false` → module calls `handler(ctx, validatedInput)` normally

**Handlers never see the approval branch** — they only execute on the normal path. This mirrors the web app pattern where the server action branches before calling the gatekeeper.

## Audit Logging

Audit entries are emitted by the module's dispatch loop, not by individual handlers. Handlers do not call `auditWriter` themselves.

Every tool invocation emits one audit entry with:
- `userId`, `companyId`, `toolName`, `args` (serialized input)
- `status`: `"success"` | `"error"` | `"pending-approval"`
- `durationMs`: measured around handler + gatekeeper execution
- `errorDetail`: gatekeeper error message if status is `"error"`
- `source`: always `"mcp"` (distinguishes from web app entries in the audit log UI)

Failed permission checks, write-toggle blocks, and auth errors are also logged (with their own status).

## Error Mapping (Gatekeeper → MCP)

Gatekeeper errors must be mapped to structured MCP error responses — the actual error message is forwarded, but stack traces are never leaked.

| Gatekeeper Error Pattern | MCP Error Code | User-visible message |
|---|---|---|
| `PermissionError` | `PERMISSION_DENIED` | Gatekeeper message passed through |
| `"MCP writes are not enabled"` | `WRITE_DISABLED` | Full message passed through |
| `ReadOnlyToolError` | `PERMISSION_DENIED` | READ tool attempted a database mutation |
| Account subtype mismatch | `VALIDATION_ERROR` | Gatekeeper message passed through |
| Balance equation failure | `VALIDATION_ERROR` | Gatekeeper message passed through |
| Status transition violation | `INVALID_STATE` | Gatekeeper message passed through |
| Prisma `P2002` unique constraint | `CONFLICT` | "A record with these details already exists." |
| Prisma `P2025` not found | `NOT_FOUND` | "The requested record was not found." |
| Any other error (unmatched domain rule or unexpected failure) | `INTERNAL_ERROR` | Actual error message passed through (no stack trace) |

**Message forwarding is the default.** Domain gatekeeper messages are authored for humans (the GUI returns them verbatim to users), so the MCP path forwards them too. Only the `P2002`/`P2025` Prisma cases and the two permission cases replace the text. The fall-through keeps the `INTERNAL_ERROR` code but forwards `msg` — never the stack. If you add a new structured category, add its pattern to `mapGatekeeperError` in `src/modules/mcp/services/create-mcp-server.ts`; the message itself does not need to change.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Import `@/lib/` in `src/modules/mcp/**` | Breaks portability, may pull in Next.js runtime | Tool handlers live in `src/lib/mcp/tools/` (app-side) |
| Per-request auth validation | Subprocess resolves session once at boot | Session context held for subprocess lifetime |
| Handler branches on `needsApproval` | Duplicates dispatch loop logic | Module handles approval — handler only executes on normal path |
| Handler calls `auditWriter` | Duplicates dispatch loop logic | Module handles all audit emission |
| Raw Prisma write in handler | Bypasses gatekeeper | Handler calls gatekeeper; gatekeeper owns DB write |
| New Zod schema for existing operation | Drift between MCP and server action | Reuse the server action's existing Zod schema |
| `no-restricted-imports` rule removed or weakened | Silent portability loss | Rule is permanent; never weaken it |
| Gatekeeper validation duplicated in handler | Double maintenance burden, can diverge | Call the gatekeeper; trust its invariant checks |
| Forgetting `register-tools.ts` when adding a feature | MCP tool silently missing | Follow new feature checklist; parity matrix flags gaps |
| Tool with wrong `requiredPageKey` | Wrong permission check applied | Grep `requirePageWrite(` in the corresponding server action |
