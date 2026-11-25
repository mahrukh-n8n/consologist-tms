# backup Module Rules

## Resource limits — mandatory

Follow [Bounded data processing](bounded-data-processing.md). New sources, migrations and hooks must preserve the existing disk-backed pipeline and byte/row limits through safety export, import, ID remapping, reference readback and audit evidence. Reuse the existing storage and worker helpers; a small backup passing is insufficient evidence of bounded memory.

## Module Location
`src/modules/backup/` — zero imports from app business logic. Extractable by copy.

## Barrel Boundary (CRITICAL)

Two entry points exist. Never mix them up.

| Entry Point | Safe In | Exports |
|---|---|---|
| `@/modules/backup/client` | `"use client"` components, shared UI | Types only: DataSource, BackupManifest, BackupData, RestoreOptions, RestorePreview, StorageDestination, BackupMetadata |
| `@/modules/backup` (index.ts) | Server components, server actions, gatekeepers | Everything above + DataSourceRegistry, encryption, checksum, export/import services, storage services |

**Rule:** Any `"use client"` file that needs backup types must import from `@/modules/backup/client` — never from the root barrel.

**Why:** `index.ts` re-exports services that use Node.js built-ins (`crypto` for encryption, `fs` for filesystem storage). Same "Jest worker" crash as auth-rbac if imported client-side.

## DataSourceRegistry Pattern

- `dataSourceRegistry` singleton exported from module root
- App calls `registerBackupSources()` once (at startup), then `freeze()`
- Follows the same singleton-register-freeze pattern as `pageRegistry` in auth-rbac
- Duplicate `key` throws at registration time (fail loud)
- Circular dependencies detected at registration time via DFS
- `resolveImportOrder()` returns topologically sorted sources respecting `dependsOn`
- Registration order matters: dependencies must be registered before dependents

## Adding New Data Sources

When adding a new Prisma model to backup, register it in `src/lib/backup/register-sources.ts`:

### Source Type Selection

| Model Structure | Helper | Example |
|---|---|---|
| Has direct `companyId` field | `simpleSource()` | Account, Shipment |
| No `companyId`, scoped via parent FK (1 level) | `childSource()` helper | JournalLine (→ JournalEntry.companyId) |
| No `companyId`, global reference data | `globalSource()` | AccountType, AccountSubtype, User |
| Grandchild (2+ levels from companyId) | Inline `DataSource` object | ForwarderQuoteDestination (→ ForwarderQuote → Shipment → companyId) |

### Global Sources (`globalSource()`)

For tables without `companyId` that are referenced by company-scoped tables via FK (e.g. `AccountType`, `AccountSubtype`):
- Exported without company filter (`findMany` with no `where`)
- Imported via `upsert` on a unique field (e.g. `name` for AccountType)
- `clear` is a NO-OP — never delete global reference data
- ID remapping still works: old ID → new ID tracked in `idMaps`

```ts
globalSource({
  key: "account-types",
  displayName: "Account Types",
  group: BACKUP_GROUP.CORE,
  dependsOn: [],
  model: (db) => m(db).accountType,
  uniqueWhere: (row) => ({ name: row.name }),  // upsert key
})
```

### User Source — Custom (NOT globalSource)

The `users` source uses a **custom inline DataSource**, not `globalSource()`, because:
1. **Company-scoped export** — exports current members plus identities referenced by the company's preserved recovery files, audit and permission history. Former membership must not strand those references; unrelated users from other companies are excluded.
2. **No passwordHash** — stripped from export data (secrets must not leave the database)
3. **Safe import** — if user exists by email, only maps the ID without overwriting their data. New users created without password (login handles `passwordHash === null` with "reset password" prompt)

```ts
// WRONG — leaks all users + passwords
globalSource({ key: "users", model: (db) => m(db).user, ... })

// RIGHT — custom source with security controls
dataSourceRegistry.register({
  key: "users",
  export: async (db, companyId) => {
    const users = await m(db).user.findMany({ where: companyBackupUserWhere(companyId) });
    return users.map(({ passwordHash: _ph, ...rest }) => rest);
  },
  import: async (db, _companyId, rows, idMaps) => {
    // If exists → map ID only. If new → create without password.
  },
});
```

### User FK Remapping (CRITICAL)

Many company-scoped models reference the `User` table. Every such FK must be remapped on restore.

### Journal Entries Domain FK Remapping (CRITICAL)

The `journal-entries` source remaps four types of FKs:

| FK Category | Fields | Handled By |
|---|---|---|
| Account FKs | debitAccountId, creditAccountId | remapFks — dependency: "accounts" |
| Batch FK | batchId | remapFks — dependency: "batches" |
| User FKs | submittedBy?, approvedBy?, rejectedBy? | remapFks — dependency: "users" |
| Domain FKs | purchaseOrderId?, shipmentId?, goodsReceiptId? | remapFks — dependencies: "purchase-orders", "shipments", "goods-receipts" |

All domain FKs are nullable and guarded with `if (row.field)` before remapping.

### User FK Remapping (Continued)

| Source | User FK Fields |
|---|---|
| journal-entries | submittedBy?, approvedBy?, rejectedBy? |
| pending-approvals | submittedBy, reviewedBy? |
| audit-logs | userId |
| notifications | userId |
| notification-preferences | userId |
| user-company-roles | userId |
| user-permission-overrides | userId, setBy |
| user-permission-assignments | userId, assignedBy |
| permission-audit-logs | actorId, targetUserId? |
| invitations | invitedBy |
| backups | userId |
| po-attachments | uploadedBy |

All these sources must have `"users"` in `dependsOn` and remap their user FKs in `remapFks`.

### Pattern: Grandchild Sources (2+ Levels from companyId)

When a model is 2+ levels away from `companyId` (e.g., `QuoteDestination → Quote → Shipment → companyId`), use an **inline DataSource** with nested relation filters. The `childSource()` helper only handles 1-level nesting.

**WRONG — childSource assumes parent has companyId directly:**
```ts
// ❌ Fails at export/import: ForwarderQuote doesn't have companyId
childSource({
  key: "forwarder-quote-destinations",
  model: (db) => m(db).forwarderQuoteDestination,
  parentFk: "forwarderQuoteId",
  parentRelation: "quote",  // quote.companyId ← doesn't exist
  // ...
});
```

**RIGHT — Inline with 2-level nested filter:**
```ts
// ✅ Nested relation filter traverses Shipment → companyId
const quoteShipmentCompanyFilter = (companyId: number) => ({
  quote: { is: { shipment: { is: { companyId } } } },
});

dataSourceRegistry.register({
  key: "forwarder-quote-destinations",
  displayName: "Forwarder Quote Destinations",
  dependsOn: ["forwarder-quotes", "warehouses", "fba-centers"],
  export: async (db, companyId) =>
    m(db).forwarderQuoteDestination.findMany({
      where: quoteShipmentCompanyFilter(companyId),
    }),
  import: async (db, companyId, rows, idMaps) => {
    // ... manual loop with FK remapping
  },
});
```

### Registration Rules

- Assign to the correct `BACKUP_GROUP` constant from `src/lib/backup/groups.ts`
- Set `dependsOn` to list every source whose IDs this source references
- For grandchild sources, include the intermediate model in `dependsOn` (e.g., `["forwarder-quotes", "warehouses", "fba-centers"]`)


If `remapFks` calls `remap(idMaps, "some-key", row.someField)`, then `"some-key"` **MUST** appear in `dependsOn[]`.

```ts
// WRONG — remaps accountId but doesn't declare dependency
simpleSource({
  key: "journal-entries",
  dependsOn: [],  // ❌ missing "accounts"
  remapFks: (row, idMaps) => {
    row.accountId = remap(idMaps, "accounts", row.accountId);
  },
});

// RIGHT
simpleSource({
  key: "journal-entries",
  dependsOn: ["accounts"],  // ✅ matches remap target
  remapFks: (row, idMaps) => {
    row.accountId = remap(idMaps, "accounts", row.accountId);
  },
});
```

Missing deps = broken restore. The dependency source won't be imported first, so `idMaps` will be empty and FKs will point to nonexistent rows.

## Storage Destinations

Three destinations, independently toggleable:

| Destination | Always On | Notes |
|---|---|---|
| `db` | Yes | BackupRecord stored in Prisma, always created |
| `filesystem` | No | Local file path, opt-in |
| `drive` | No | Google Drive via callback-injected `DriveUploader` |

Drive adapter lives in `src/lib/backup/drive-adapter.ts` — bridges `DriveUploader` interface to the app's google-drive module. The backup module never imports google-drive directly (keeps it portable).

## Restore Safety

- **Mandatory safety backup:** Before any restore, a full backup is created automatically (`isSafetyBackup: true`). This is non-negotiable — the service enforces it.
- **Recoverable safety copy:** Safety exports must require every registered source to export successfully. At least one storage destination must contain the encrypted backup; a metadata row alone does not authorize clearing data.
- **Destination tenant:** Child sources that also carry `companyId` must replace it with the destination company, in addition to remapping their parent foreign key. Test cross-company restores with different numeric IDs.
- **Atomic transaction:** Entire restore runs inside a single Prisma `$transaction`
- **Reverse-clear then forward-import:** Clear tables in reverse dependency order (children first), then import in forward dependency order (parents first)
- **Selective restore:** When restoring specific sources, transitive dependencies are auto-included via `resolveDependenciesFor()`

## Encryption

- AES-256-GCM with scrypt-derived key
- Password is not stored or recoverable — user must remember it
- `isEncryptedBackup()` detects encrypted payloads before attempting decrypt
- Encrypted backups use a distinct header/format so plain-text restore is blocked

## Groups

Defined in `src/lib/backup/groups.ts`. Always use `BACKUP_GROUP` constants — never inline group name strings.

```ts
import { BACKUP_GROUP } from "@/lib/backup/groups";
// BACKUP_GROUP.CORE, BACKUP_GROUP.ACCOUNTING, BACKUP_GROUP.PROCUREMENT, etc.
```

`BACKUP_GROUP_ORDER` array defines UI display order.

## Prisma Import in Portable Modules

Same rule as auth-rbac — accept `db: PrismaClient` as a parameter, type import from app-local path:

```ts
import type { PrismaClient } from "@/generated/prisma/client"; // ✅ always
import type { PrismaClient } from "@prisma/client";            // ❌ wrong for this project
```

## Server Action Registration (CRITICAL)

Server actions that use `dataSourceRegistry` run in separate workers where the dashboard layout's `registerBackupSources()` may not have executed. **Every backup server action file must call `registerBackupSources()` at module scope:**

```ts
"use server";
import { dataSourceRegistry } from "@/modules/backup";
import { registerBackupSources } from "@/lib/backup/register-sources";

// Ensure sources are registered in this server action worker
registerBackupSources();
```

This is idempotent (`if (dataSourceRegistry.isFrozen()) return`), so calling it multiple times is safe.

Files that need this: `src/app/(dashboard)/admin/backups/actions.ts` and `src/app/(dashboard)/admin/backups/restore/actions.ts`.

## Layer 2 — FK Validation at Dev Startup

`src/lib/backup/validate-sources.ts` cross-checks all registered backup sources against `prisma/schema.prisma` at dev startup. Runs automatically after `freeze()` when `NODE_ENV === "development"`.

**What it catches:**
- FK fields in schema with no matching `dependsOn` entry → would cause broken ID mapping on restore
- Prisma models with `companyId` that have no backup source → data silently lost on restore

**How it works:**
1. Parses `prisma/schema.prisma` to extract every model's `@relation(fields: [...])` FK fields
2. For each registered source, looks up its Prisma model via `SOURCE_TO_MODEL` mapping
3. Checks that every FK field's target model has a matching entry in `dependsOn`
4. Checks that every `companyId` model has a registered backup source

**When adding a new backup source:** Also add the source key → model name to `SOURCE_TO_MODEL` in `validate-sources.ts`. If you skip this, validation can't check that source's FKs.

**Porting:** See `src/modules/backup/PORTING.md` for instructions on setting this up in a new app.

## New Model Checklist (CRITICAL — Schema-Level FK Audit)

**Backup sources are NOT auto-discovered.** When adding a new Prisma model:

1. Register it in `src/lib/backup/register-sources.ts` using the correct helper
2. **Open the Prisma schema** and list EVERY field with `@relation` — these are FK columns
3. For EACH FK field:
   - Add the target source key to `dependsOn`
   - Add the remap line in `remapFks`
   - If nullable (`Int?`): wrap in `if (row.field)` guard
   - If the FK target isn't a backup source: add it as a source OR null it out in remapFks
4. If this model is referenced by OTHER backed-up models, update THEIR `dependsOn` + `remapFks` too
5. **Verify field names:** every `row.X` in `remapFks` must be an actual column name from the schema — never guess
6. **Verify count:** FK fields in schema vs remap lines — they MUST match
7. Test backup + restore on a fresh database

**Common FK categories that get missed:**
- User FKs: `userId`, `submittedBy`, `approvedBy`, `rejectedBy`, `setBy`, `assignedBy`, `uploadedBy`, `invitedBy`, `actorId`
- Account FKs: `apAccountId`, `bankAccountId`, `inventoryAccountId`, `defaultAccountId`, `creditAccountId`
- Address FKs: `registeredAddressId`, `factoryAddressId`, `originAddressId`
- Cross-domain FKs: `productId`, `shipmentId`, `journalEntryId`, `fbaShipmentPlanId`
- Self-referential FKs: `parentPlanId` (same model key in dependsOn)

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Import `@/modules/backup` in `"use client"` | Pulls in Node.js crypto/fs, crashes webpack | Import from `@/modules/backup/client` |
| `remap()` target not in `dependsOn` | Restore fails silently — FKs point to nothing | Every remap key must be a declared dependency |
| Register sources after `freeze()` | Throws at runtime | Register all sources before calling `freeze()` |
| Inline group name string (`"Accounting"`) | Typo = source in wrong group, no compile error | Use `BACKUP_GROUP.ACCOUNTING` constant |
| Skip safety backup before restore | Data loss if restore fails or is wrong | Service enforces this — never bypass |
| Import google-drive in backup module | Breaks portability | Use `DriveUploader` callback interface via adapter |
| `deleteMany` without company scope in `clear` | Deletes other companies' data | Always scope by `companyId` (direct or via parent relation) |
| Register child before parent | Topological sort works but `idMaps` empty during import | Register dependencies first |
| Use `childSource()` for grandchild models | Prisma query fails: parent doesn't have companyId | Use inline DataSource with nested relation filter |
| Model with user FK but no `"users"` in dependsOn | Restore fails with FK constraint violation | Add `"users"` to dependsOn + remap user FK fields |
| Missing `registerBackupSources()` in server action | "No data sources registered" error on backup/restore | Call at module scope in every backup action file |
| Assuming new models are auto-included in backup | Model data silently excluded from backups | Manually register every new Prisma model |
| Guessing FK field names instead of reading schema | `remap()` silently no-ops on nonexistent fields; real FK keeps old ID → constraint violation | Always verify field names against `prisma/schema.prisma` |
| Remapping fields that don't exist on the model (e.g. `row.forwarderId` on ForwarderInvoice) | Dead code that hides the real missing remap | Open schema, list actual `@relation` fields, use those exact names |
| Assuming payment models have `debitAccountId`/`creditAccountId` | Many payment models use `bankAccountId` instead | Check schema — field naming is model-specific, not domain-generic |
| Using `globalSource()` for users | Exports ALL users (multi-tenant leak) + includes passwordHash | Use custom inline source: company-scoped export, strip secrets, safe import |
| Upsert overwriting existing users on restore | Company A's backup overwrites Company B's user data | On import: if user exists by email, only map ID — never overwrite fields |

## Cross-workflow identity and chronology

Follow [Linkage and business dates](linkage-and-dates.md) for every new model, relationship and restore adapter. Restore remapping proves identity within the backup, while domain validation proves company/product/parent compatibility. Neither replaces the other. Business dates must survive backup/restore unchanged; insertion timestamps are not fallback receipt evidence.

## Rehearsal evidence

Run database rehearsals against an isolated destination with deliberately different IDs. Verify mapped relationships, company ownership, quantities and business dates after commit, and unchanged business rows after a forced failure. Report unclassified references separately from proven missing targets. A reduced fixture passing does not establish that the unmodified full backup is restorable; keep its exclusions and the full-backup rejection in the report.


## Snapshot contracts and identity types

- Preserve each source's declared ID type, derived from its Prisma model. String identities must not be coerced to numbers; numeric sources must still reject string IDs.
- Classify JSON references in workflow context. A nested `id` needs an explicit path or an established typed object; an identically named field in another snapshot is not sufficient evidence.
- Forecast listing arrays, fulfillment pools, warehouses and reorder snapshot listing/settings/supplier/user links use the authoritative post-import mapping and read-back verification.
- Adding a contract can expose additional historical damage. Report newly detectable missing targets separately from newly introduced corruption. Do not weaken the blocker to make a rehearsal pass.

- PO additive cost repairs are operational evidence used by close/undo. Their source owner is a purchase order; typed nested payment/misc/inspection/invoice IDs, GRNs, journals and allocations require explicit mappings. Keep the correction-type owner map shared between import and validation.
- Shipment recovery may disregard arrival status and actual arrival date when comparing original/current records, but must retain the shipment reference, creation timestamp and all other populated non-reference content. Reject duplicate matches, changed identity and already-valid target IDs.
- Polymorphic tag creation must use `addEntityTag`, which validates the target's existence and company inside the transaction. Do not upsert arbitrary `entityId` values from UI input.
