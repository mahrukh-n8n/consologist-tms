# Porting the Backup Module to a New App

This module (`src/modules/backup/`) is portable — zero imports from app business logic. To use it in a new project, copy this entire directory and create the app-specific bridge files described below.

## What You Get (This Module)

- `DataSourceRegistry` — singleton registry with topological sort, cycle detection
- `DataSource` interface — what apps register (export/import/count/clear per table)
- AES-256-GCM encryption + checksum verification
- Export/import services with progress tracking
- Storage destinations (DB, filesystem, Google Drive via callback)

## What You Must Create (App-Specific)

### 1. `src/lib/backup/register-sources.ts`

Register every Prisma model as a backup data source. Use the three helpers:

| Helper | When to Use |
|---|---|
| `simpleSource()` | Model has direct `companyId` field |
| `childSource()` | Model scoped via parent FK (1 level, no `companyId`) |
| `globalSource()` | Global reference data (e.g. User, AccountType) |
| Inline `DataSource` | Grandchild models (2+ levels from `companyId`) |

Each source MUST declare:
- `dependsOn` — every source whose IDs this source references via FK
- `remapFks` — remap every FK field using `remap(idMaps, "source-key", row.fieldName)`

**Critical:** Always read the Prisma schema to get exact field names. `remapFks` receives `row: any` — TypeScript won't catch wrong field names.

```ts
export function registerBackupSources(): void {
  if (dataSourceRegistry.isFrozen()) return;

  dataSourceRegistry.register(
    simpleSource({
      key: "your-model",
      displayName: "Your Model",
      group: "Your Group",
      dependsOn: ["parent-source"],
      model: (db) => db.yourModel,
      remapFks: (row, idMaps) => {
        row.parentId = remap(idMaps, "parent-source", row.parentId);
      },
    })
  );

  dataSourceRegistry.freeze();
}
```

### 2. `src/lib/backup/validate-sources.ts` (Layer 2 — Recommended)

Cross-checks registered sources against the Prisma schema at dev startup. Catches:
- Missing FK remaps (schema has FK, source doesn't remap it)
- Missing `dependsOn` entries (remap targets a source not in `dependsOn`)
- Unregistered models (Prisma model with `companyId` has no backup source)

Wire it into `registerBackupSources()`:

```ts
dataSourceRegistry.freeze();

if (process.env.NODE_ENV === "development") {
  const { validateBackupSources } = require("./validate-sources");
  validateBackupSources();
}
```

The validation script needs a `SOURCE_TO_MODEL` mapping (source key → Prisma model name) to connect the two worlds. Update this map whenever you add a source.

### 3. `src/lib/backup/groups.ts`

Define backup group constants for UI organization:

```ts
export const BACKUP_GROUP = {
  CORE: "Core",
  // ... your groups
} as const;
```

### 4. Server Action Registration

Server actions run in separate Next.js workers. Each backup action file must call `registerBackupSources()` at module scope:

```ts
"use server";
import { registerBackupSources } from "@/lib/backup/register-sources";
registerBackupSources(); // idempotent — safe to call multiple times
```

### 5. Google Drive Adapter (Optional)

If using Drive backup, create an adapter that bridges the module's `DriveUploader` interface to your app's Google Drive integration.

## Registration Checklist (Per Model)

1. Open `prisma/schema.prisma` — find the model definition
2. List every field with `@relation(fields: [...])` — these are FK columns
3. For each FK field:
   - Add the target source key to `dependsOn`
   - Add `row.fieldName = remap(idMaps, "target-key", row.fieldName)` in `remapFks`
   - If nullable (`Int?`): wrap in `if (row.fieldName)` guard
4. Add the source key → model name mapping in `validate-sources.ts`
5. Run the dev server — Layer 2 validation will catch any mistakes

## Common Mistakes

| Mistake | What Happens | Prevention |
|---|---|---|
| Wrong field name in `remapFks` | Silently no-ops — FK keeps old ID → constraint violation | Layer 2 validation + always read schema |
| Missing `dependsOn` entry | Target source imported after this source → `idMaps` empty | Layer 2 validation flags this |
| Self-referential FK in `dependsOn` | Circular dependency detected at startup | Skip self-refs in `dependsOn`; use `if` guard in `remapFks` |
| Forgot to register a model | Data silently excluded from backups | Layer 2 flags models with `companyId` that have no source |
| Import `@/modules/backup` in client component | Webpack crash (Node.js crypto/fs) | Import from `@/modules/backup/client` |
