---
description: Mandatory transactional snapshots for new and existing business-record deletion paths
alwaysApply: true
---

# Audited deletion

Every new business-record deletion and every existing deletion path being changed must use `deleteWithAudit` from `src/lib/audit/delete-with-audit.ts` through its domain mutation. UI, MCP, API, imports, background jobs, rebuilds and repairs must converge on that same boundary. Do not add direct `delete`, `deleteMany`, raw DELETE or cascading-delete bypasses in entry points.

## Required contract

- Authenticate and enforce the relevant page/domain permission before invoking the mutation. Pass the actual authenticated actor and company, a nonblank reason, and a stable workflow source. Never invent a user ID, accept the actor from form input, or substitute the original record creator.
- Use a caller-owned Serializable transaction. The central function requires a transaction client, checks isolation and actor membership, and locks the company-scoped parent before capture. Propagate failures out of the transaction; do not catch an audit/delete error and commit earlier effects.
- The domain capture adapter is read-only: recheck identity, lifecycle, dependency and fiscal restrictions, then capture the complete original record. Never weaken domain rules to permit deletion simply because it is audited.
- Inventory all owned children, FK cascades, attachment metadata and references before adding a table to the central allowlist. Capture every row that will be deleted, plus relevant reference labels/currencies needed for independent interpretation. A JE snapshot includes its header, compound lines, general ledger, attachments and shipment allocation links. Capture before removing children; for earlier deletions within a larger workflow, retain its full original workflow snapshot too.
- Preserve monetary precision, BigInts and dates using `toAuditJson`. Audit records contain versioned original JSON, historical identity namespace, reason, source, actor, and deletion timestamp. Do not copy passwords, tokens, private keys, or attachment bytes into snapshots. Review secret-bearing entities separately.
- Await audit creation on the same transaction before removal. Audit failure leaves the record intact; removal failure rolls back the audit. Audit history has no normal update/delete or automatic replay path. Do not use the asynchronous Prisma extension as the deletion guarantee.
- Batch deletions require snapshots for every deleted record (or a reviewed complete workflow snapshot through an explicit bulk adapter); a count, WHERE clause or list of IDs is insufficient. Reversals, soft deletion, configuration replacement and retention/restore maintenance require an explicit lifecycle/evidence policy, not an implicit exception.
- Original IDs inside deletion evidence are historical, not live navigation/restore targets. Existing audit backup contracts preserve these JSON fields; restoring business state is a separate validated operation.

## Coverage and verification

Currently migrated: manual JE deletion, JE deletions during GRN rebuild and buy-side undo, and account deletion. This rule does not imply every legacy delete elsewhere is migrated. When touching another deletion path, migrate it and its callers before shipping; report any remaining scoped gap explicitly.

Required tests: complete regular/compound snapshots and cascades, actor/company isolation, blank reason, protected references, audit failure, delete failure, concurrent deletion, transaction rollback, and GUI reason/error behavior. Use a disposable local database for persistence/rollback checks, never production.

State transition: `existing → locked and validated → snapshot staged → deleted + audit committed`. Any error returns to the original database state. Retrying a successfully deleted ID must fail as missing, without another DELETE audit.
