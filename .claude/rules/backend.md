---
description: "Backend rules: Server Actions, multi-tenant companyId scoping, Decimal.js, Prisma serialization"
alwaysApply: false
---

# Backend Rules

## Growing datasets — mandatory

Follow [Bounded data processing](bounded-data-processing.md) for growing queries, uploads, reports, imports, exports, syncs and bulk jobs. Review the complete pipeline, including adapters, temporary state, verification and results; the shared rule defines the required resource budgets and acceptance checks.

## Reusable Classes — Check First
Before writing any utility, helper, hook, or wrapper: run `/reusable-classes search {keyword}`.
If a match exists → import it. If partial → extend it. Only create new if no match.
After creating a reusable piece: run `/reusable-classes register` to add it to the registry.

**Extraction rule:** If you find yourself writing the same pattern a second time → stop. Extract a shared base first, then use it in both places. Never let a pattern appear in 2+ files without a central home.

## Environment Variables — Always Update All 3 Locations

When adding a new environment variable:

1. **`.env.example`** — add commented-out entry with description (documents the var)
2. **`docker-compose.yml`** — add `VAR_NAME: ${VAR_NAME}` under the `app.environment` block
3. **`.env.docker`** — add the actual value (this file is gitignored — never commit secrets)

**Never add a var to the app without updating all 3.** Missing from `docker-compose.yml` = var silently undefined in production even if set on the host.

```yaml
# docker-compose.yml — app.environment
MY_NEW_VAR: ${MY_NEW_VAR}
```

```bash
# .env.example
# MY_NEW_VAR=             # Description of what this does
```

```bash
# .env.docker (gitignored)
MY_NEW_VAR=actual_value_here
```

---

## Server Actions Only
All mutations via Server Actions (`"use server"`). No client-side DB writes.

## "use server" Files — Async Functions Only
Files (or inline functions) marked `"use server"` may ONLY export **async functions**.

**Never export from a `"use server"` file:**
- `export const MAP = { ... }` — plain object → crashes Next.js 16 page data worker
- `export { someConstant }` — re-exported constant → same crash
- `export function nonAsync() { ... }` — sync function → violation

**Allowed:**
- `export async function action() { ... }` — ✅
- `export interface Foo { ... }` — ✅ (TypeScript erases interfaces at compile time)
- `export type Bar = ...` — ✅ (erased)

**Diagnosis:** Run `next build`. If you see `A "use server" file can only export async functions, found object`, grep the failing file for `^export const` and `^export {`. Move the constant to a non-server utility file.

**Cascading failure symptom:** One bad `"use server"` export kills a page data worker, causing "Jest worker encountered 2 child process exceptions" on unrelated pages — making it look like many pages are broken when only one file is at fault.

**Transitive trap:** Files imported as side-effects by `"use server"` files (e.g. `import "@/lib/approval/register-all-handlers"`) are part of the server module graph. If they re-export sync functions, Next.js may fail to process the importing file — causing all its server actions to silently not load. Symptom: page hangs on "Loading..." because `useEffect` calling the action never resolves. Fix: side-effect-only files should have zero exports.

## Multi-Tenant Scoping
Every query scoped by `companyId`. Missing scope = data leak.
- New Prisma models with `companyId`: register in both `SCOPED_MODELS` and `DIRECT_COMPANY_ID_MODELS` in `src/lib/db-scoped.ts`
- Creates: use `prisma.model.create({ data: { ...fields, companyId } })` directly
- Reads/updates/deletes: use `scopedPrisma.model.findMany(...)` (companyId auto-injected)

## Currency Math
Decimal.js with 28-digit precision, ROUND_HALF_UP for all currency calculations.

## Prisma Client Boundary
- Call `.toString()` on all Decimal/BigInt fields before returning from server actions
- Client interfaces use `string`, not `Decimal` or `bigint`

## Date Handling
- ISO date display: `.slice(0, 10)` not `.split("T")[0]` (split returns `string | undefined`)

## Prisma Client Import Path
This project generates the Prisma client to `src/generated/prisma/` (not the default `node_modules/@prisma/client`).

**Always import from the app-local path:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"; // ✅
import type { PrismaClient } from "@prisma/client";            // ❌ wrong for this project
```

This applies everywhere — server actions, gatekeepers, and portable modules (`auth-session`, `auth-rbac`).
Portability of modules is achieved by accepting `db: PrismaClient` as a parameter, not by the import path.

## normalBalance and Business Currency
Both immutable after creation. Never allow editing:
- `normalBalance`: read-only badge in edit form
- `businessCurrency`: set once at company creation, no update path

## Next.js Middleware Convention (proxy.ts)

Next.js 16+ uses `proxy.ts` (not `middleware.ts`). **Never have both files** — proxy.ts is the single entry point.

### proxy.ts Responsibilities

`src/proxy.ts` is the **only middleware** in the application:

1. **JWT validation on protected routes:** Reads `auth-session` cookie, verifies with JWT secret, blocks access if invalid
2. **x-pathname header:** Sets `x-pathname` request header on all non-public routes so dashboard layout can enforce page-level permissions
3. **Public route list:** Defines routes that don't require authentication (login, register, OAuth, htmldocs, assets)
4. **Protected route list:** Defines routes that require auth (dashboard, admin)
5. **Fallthrough routes:** Any route not in PUBLIC_PREFIXES or PROTECTED_PREFIXES passes through (e.g. `/awaiting-permissions`, `/companies/new`)

### Key Flows

**Authenticated user visiting protected route:**
```
Request → proxy.ts
  → Check JWT valid ✓
  → Set x-pathname header
  → Return NextResponse.next() (pass to layout)
  → Dashboard layout reads x-pathname → enforces page permissions
```

**Unauthenticated user visiting protected route:**
```
Request → proxy.ts
  → JWT missing or invalid
  → proxy.ts calls redirectToLogin()
  → Redirect to /login?callbackUrl=/original/path
  (no page/layout code runs)
```

**Public route (no auth check):**
```
Request → proxy.ts
  → Route in PUBLIC_PREFIXES
  → Return NextResponse.next() immediately (skip JWT check)
  → Page/layout runs without auth requirement
```

### Do NOT put auth logic in layout
- Layout assumes proxy.ts already validated the JWT
- Layout ONLY reads x-pathname and enforces page-level permissions
- If you add auth to layout, you duplicate what proxy.ts does

## Backup reference integrity (mandatory)

- Every new model/source must have a model mapping and a reference contract. Database relations are derived from the schema; plain integer IDs, polymorphic IDs, and JSON references must be explicitly classified in `src/lib/backup/reference-contracts.ts`.
- Use typed reference field names in live JSON. Do not hide database IDs under unclassified keys. Archival/external exemptions must be field-specific and must never be used as live navigation or mutation targets. A snapshot read by business logic is live, even if its name contains “snapshot”.
- Missing ID maps are errors. Never retain an old database ID, substitute a nearby ID, apply an offset, or drop a link to make restore succeed.
- Restore must preflight the original references, copy import inputs, map references in one transaction, read them back, and compare their exact targets against the original-to-new map before commit. Keep restore manifests outside destructive restore clearing.
- Missing dependency tables, unsafe selective restores and failed migrations must abort; never interpret missing backup data as an empty table.
- Repairs use the shared gatekeeper, a reviewed candidate list/hash, a fresh evidence check and before/after audit. Existence does not prove correct identity. Ambiguous matches are investigation findings, not repair instructions.
- Run `npm run check:backup-integrity` for backup/schema/reference changes. It also runs before production builds. Add a collision test where the old ID names a different valid record; happy-path restore tests alone are insufficient.

## Amazon marketplace identity

For Amazon listing and margin comparisons, normalize both operands with `amazonMarketCode` from `@/lib/products/amazon-link`. Either side can contain a supported country name or code (Germany / DE, United Kingdom / UK / GB). Company-market validation must compare normalized configured codes and names within the current company, not run an exact-code-only lookup. Keep listing/product/SKU/company guards; aliases must never turn a different country's listing into a match. Test both directions and mixed case/whitespace when changing this boundary.
