# auth-rbac Module Rules

## Module Location
`src/modules/auth-rbac/` — zero imports from app business logic. Extractable by copy.

## Barrel Boundary (CRITICAL)

Two entry points exist. Never mix them up.

| Entry Point | Safe In | Exports |
|---|---|---|
| `@/modules/auth-rbac/client` | `"use client"` components, shared UI | Types, models, PageRegistry, audit-formatter, hooks, PermissionProvider, PermissionContext |
| `@/modules/auth-rbac` (index.ts) | Server components, server actions, gatekeepers | Everything above + services, middleware (Prisma-backed), approval services |

**Rule:** Any `"use client"` file that needs auth-rbac must import from `@/modules/auth-rbac/client` — never from the root barrel.

**Why:** `index.ts` re-exports `services/index.ts` → Prisma → `pg` → `require('tls')` (Node built-in). Importing it in a client component crashes the webpack/Turbopack worker with a misleading "Jest worker encountered 2 child process exceptions" error.

### WRONG

```ts
// "use client" component
import { formatAuditDelta, PermissionAuditLogEntry } from "@/modules/auth-rbac"; // ❌ pulls in Prisma
```

### RIGHT

```ts
// "use client" component
import { formatAuditDelta } from "@/modules/auth-rbac/client";              // ✅ client-safe
import type { PermissionAuditLogEntry } from "@/modules/auth-rbac/client";  // ✅ type-only also fine
```

## "Jest Worker" Error = Client/Server Boundary Violation

If you see:
```
Jest worker encountered 2 child process exceptions, exceeding retry limit
```

This is **not** a Jest bug. It means a `"use client"` component (or something it imports) transitively pulls in a Node-only built-in (`tls`, `net`, `fs`, etc.) through a server-only dependency (Prisma, pg, etc.).

**Diagnosis steps:**
1. Find the client component that recently had its imports changed
2. Trace its import chain for any server-only module
3. Switch to the client-safe barrel or use a direct subpath type-only import

## fetchExchangeRate Return Shape

`fetchExchangeRate()` returns `ExchangeRateResult | null` where:

```ts
type ExchangeRateResult = { rate: Decimal; fetchedAt: Date }
```

Always extract `.rate` before wrapping in `new Decimal()`:

```ts
// WRONG
const rateResult = await fetchExchangeRate(from, to);
new Decimal(rateResult.toString()) // ❌ "[object Object]"

// RIGHT
const rateResult = await fetchExchangeRate(from, to);
rateResult ? new Decimal(rateResult.rate.toString()) : new Decimal(1) // ✅
```

## Prisma Import in Portable Modules
Both `auth-rbac` and `auth-session` modules accept `db: PrismaClient` as a parameter for portability. The **type import** must still use the app-local generated path:

```ts
import type { PrismaClient } from "@/generated/prisma/client"; // ✅ always
import type { PrismaClient } from "@prisma/client";            // ❌ wrong for this project
```

## Access Levels
Three levels: `NONE` / `READ_ONLY` / `READ_WRITE` (per page).

- `SUPER_ADMIN` always bypasses all permission checks
- `READ_ONLY` = dual-layer: UI hides mutation buttons + server blocks mutations via `withPagePermission`
- Audit log entries are immutable — no editing or deletion

## Page Registry
- `pageRegistry` singleton exported from module root
- App calls `registerAppPages()` once (in layout), then `freeze()`
- `hrefToPageKey("/tools/fx-settlement")` → `"tools-fx-settlement"` (deterministic)
- Duplicate `pageKey` throws at dev time (fail loud)
- Bridge file: `src/lib/auth/page-definitions.ts` — derives pageKeys from sidebar hrefs, no manual sync needed

## Page-Level Permission Enforcement

### Server-Side (Full Page Loads)
Dashboard layout (`src/app/(dashboard)/layout.tsx`) enforces page-level permissions:
- Reads `x-pathname` header set by `src/proxy.ts`
- Converts pathname to pageKey (progressively shorter path segments, e.g. `/purchase-orders/123` → `purchase-orders`)
- Looks up access level in `pagePermissions` map (resolved server-side for all pages)
- If access = `NONE` and user is not SUPER_ADMIN: redirects to first allowed page
- SUPER_ADMIN bypasses all checks

### Client-Side (Soft Navigations)
`<PageAccessGuard>` component (`src/components/dashboard/page-access-guard.tsx`) enforces on client-side navigation:
- Wraps page `children` in dashboard layout
- Listens to pathname changes via `usePathname()`
- Same pathname → pageKey conversion logic
- If access = `NONE` or undefined: shows "Access Denied" message with sidebar visible (no redirect)
- Users can navigate away via sidebar

### Defense in Depth
- Server check runs on every full page load (browser refresh, initial visit)
- Client check runs on every soft navigation (link click, programmatic redirect)
- Both use the same `pagePermissions` map populated from `getPageAccessLevel()` per page per user
- Sidebar and mobile nav pre-filter items based on `pagePermissions` (UX layer only — not security)

## V4 Server Action Permission Pattern (CURRENT SYSTEM)

All server actions enforcing mutations must call one of these functions from `src/modules/auth-rbac/middleware/page-access.ts`:

### `requirePageAccess(userId, companyId, pageKey): Promise<AccessLevel>`
- Requires READ_ONLY or READ_WRITE access
- Returns the actual access level (READ_ONLY or READ_WRITE) for branching
- Throws `PermissionError` if access = NONE
- **Use for:** Read operations, details fetches

```ts
// Read server action
export async function fetchJournalEntry(entryId: number) {
  const { userId, company } = await requireCompany();
  const level = await requirePageAccess(userId, company.id, "journal");

  const entry = await scopedPrisma.journalEntry.findUnique({
    where: { id: entryId, companyId: company.id },
  });
  return entry;
}
```

### `requirePageWrite(userId, companyId, pageKey): Promise<void>`
- Requires READ_WRITE access (SUPER_ADMIN bypasses)
- Throws `PermissionError` if access ≠ READ_WRITE
- **Use for:** Simple mutations (updates, deletes) that don't need approval routing

### `requireWriteGate(userId, companyId, pageKey): Promise<WriteGate>` (PREFERRED)

**The single centralized gate for all entity-creating server actions.** Combines permission check + approval check in one call so no action can forget either.

Returns a `WriteGate` object with `needsApproval`, `userId`, `companyId`, `pageKey`.

After entity creation, call `submitForApprovalIfNeeded(gate, entityType, entityId)` to complete the flow.

### Write + Approval Pattern (MANDATORY for entity creation)

Every server action that **creates** an entity on an approval-enabled page MUST use `requireWriteGate` and branch on `needsApproval`:

```ts
"use server";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";

export async function createPurchaseOrder(formData: FormData) {
  const { user, company } = await requireCompany();
  const gate = await requireWriteGate(user.id, company.id, "purchase-orders");

  if (gate.needsApproval) {
    // Serialize payload + display names → save to PendingApproval as JSON
    // Do NOT create the real entity — it doesn't exist until approved
    // Redirect to /my-requests
    return { approvalRequired: true };
  }

  // Normal path: create entity directly via gatekeeper
  const po = await prisma.$transaction(async (tx) => { /* ... */ });
  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${po.id}`);
}
```

**Rules:**
- `requireWriteGate` = `requirePageWrite` (without approval block) + `getPageApprovalRequired` in one call
- When `needsApproval=true`: serialize form data as JSON into PendingApproval table, do NOT create real entity
- When `needsApproval=false`: create entity normally via domain gatekeeper
- On approval: handler deserializes payload → calls the same gatekeeper → real entity created
- On rejection: PendingApproval marked REJECTED, nothing to clean up (no real entity exists)
- SUPER_ADMIN always gets `needsApproval=false` (bypasses)

**Update/delete actions that DON'T need approval routing:** Use `requirePageWrite` directly. `requirePageWrite` blocks makers with approval from all non-creation mutations.

### Delete Access Pattern (for soft-deletes or cascading deletes)
When deleting requires checking write access, use `getPageAccessLevel()` + compare:

```ts
"use server";
export async function deleteJournalEntry(entryId: number) {
  const { userId, company } = await requireCompany();
  const level = await getPageAccessLevel(userId, company.id, "journal");

  if (level !== AccessLevel.READ_WRITE) {
    throw new PermissionError(`Cannot delete: insufficient permissions`);
  }

  // Delete logic
}
```

### All functions are SUPER_ADMIN-safe
- `getPageAccessLevel`: SUPER_ADMIN always returns READ_WRITE (no DB lookup)
- `requirePageAccess`: SUPER_ADMIN always succeeds (returns READ_WRITE)
- `requirePageWrite`: SUPER_ADMIN always succeeds (no throw)

## Page-Level Approval Requirements (Phase 54+)

### Core Principle: Every Page Supports Approval
Every page in the registry can have `requiresApproval=true` in a permission template. There is no whitelist — the approval toggle is available for all pages. The template builder dynamically lists all registered pages with the approval checkbox enabled when access level is READ_WRITE.

### Server-Side Resolution
`getPageApprovalRequired(userId, companyId, pageKey)` resolves whether a page has approval enabled for a user:
- Looks up user's permission template assignment
- Reads `PermissionTemplatePage.requiresApproval` for the given pageKey
- Returns `true` if approval required, `false` otherwise
- **SUPER_ADMIN always returns `false`** (bypasses approval)
- Returns `false` if no template or page mapping exists
- Overrides cancel approval (if user has a permission override for the page, approval is bypassed)

### `requirePageWrite` Blocks Makers with Approval
`requirePageWrite(userId, companyId, pageKey)` now checks approval after access level:
- If access level is not READ_WRITE → throws PermissionError
- If user has `requiresApproval=true` for this page → throws PermissionError ("Modifications require approval")
- This blocks ALL non-creation mutations (edit, delete, add cost, close, etc.) for makers with approval
- Only `requireWriteGate` (used for entity creation) bypasses this second check

### Client-Side UI Hiding
- `ApprovalRequiredContext` (React context) populated in dashboard layout with approval-required pageKeys
- `useApprovalRequired(pageKey)` hook returns `true` when UI should hide mutation buttons
- Both exported from `@/modules/auth-rbac/client` (client-safe barrel)
- Layout resolves approval pages in bulk (1 query for template pages + 1 for overrides)

### Staging-Based Approval (Brainstorm 015 — PLANNED)
The approval system is being redesigned so pending entities are never written to real tables. Instead:
- Form payload is serialized as JSON into PendingApproval table
- On approval: payload deserialized → executed through normal gatekeeper → real entity created
- On rejection: PendingApproval marked REJECTED, nothing to clean up
- See `.planning/brainstorms/015-staging-based-approval-system-brainstorm.md`

### Subpage Approval Scope
- `requiresApproval` is per **pageKey** (flat, no hierarchy)
- Sub-URLs under the same pageKey inherit automatically (e.g. `/shipments/123` → pageKey `shipments`)
- Separate pages (even if conceptually related) are independent (e.g. `tools-shared-cost-allocation` ≠ `shipments`)
- Sub-pages not in nav that share a parent's pageKey (e.g. `/settings/account-subtypes` uses `settings-account-types`) inherit from parent

### Module Boundary for Approval
To avoid circular deps and keep auth-rbac portable:
- auth-rbac only provides: `requireWriteGate`, `getPageApprovalRequired`, `ApprovalRequiredContext`
- Approval registry, handlers, gatekeeper, and preview UI live in `src/lib/approval/` (app-specific, not portable)
- Template service validates `requiresApproval` requires READ_WRITE access — no further handler check needed

## Deprecated: Old Permission System (PHASE V3)

The old `requirePermission(userId, companyId, module, action)` system is deprecated and should not be used in new code.

**Old pattern (DO NOT USE):**
```ts
import { checkPermission } from "@/lib/auth/permissions";

// ❌ Old system — checks hardcoded PERMISSION_MATRIX by role
await requirePermission(userId, companyId, "journal", "write");
```

**Replacement (NEW):**
```ts
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";

// ✅ New system — checks V4 template + override chain
await requirePageWrite(userId, companyId, "journal");
```

**Migration path:** Search for `requirePermission(`, replace with `requirePageWrite()` for writes or `requirePageAccess()` for reads.
