---
description: Mandatory reference and business-date integrity for pages, mutations, repairs, imports and restores
alwaysApply: true
---

# Linkage and business dates

## Before implementation

Map the records written, their parents, children, indirect/JSON references, business dates and audit evidence. Identify the shared mutation boundary and the existing date resolver. A new page must consume that boundary rather than reconstructing business rules.

## References are identities, not just numbers

- Validate existence, company ownership and domain compatibility inside the committing transaction. A foreign key can exist but point to the wrong product, batch, shipment or dispatch after restoration.
- Changing a parent identity requires reviewing every dependent link, including detailed allocations and embedded references. Reconcile the whole chain atomically or reject with the affected IDs; never repair only the visible parent.
- For carton product corrections, preserve immutable measurements and original receipt provenance. Reuse an exact compatible template or explicitly reconstruct and audit a target template. Do not change historical GRN product labels to conceal an audited reclassification.
- Whole-lot corrections may retain the lot ID. Partial allocations must use the shared split operation and preserve parent ancestry. Never duplicate stock to obtain a fresh ID.
- Missing required links, cross-company links, ambiguous evidence, duplicate allocations and unresolved source ancestry block writes. Null is acceptable only where the lifecycle explicitly permits absence, never as a way to hide damage.

## Dates are business facts

- Require the selected business date at the shared gatekeeper, including GUI, MCP, imports and repair callers. Validate a real calendar date. Never substitute `createdAt`, restore time, batch finalization time or the current date for physical receipt/consumption evidence.
- Use `resolveStorageEffectiveDates` and `assertConsumptionDate` / `eligibleConsumptionLotIds` as the shared source for receipt eligibility. FIFO preview and posting must use the same cutoff and selection logic, including reserved stock and ancestor lots.
- Persist selected dates on the affected business events; preserve receipt dates when splitting or relabelling existing stock. Repacking, dispatch, transfers, sales and FBA receipt must respect their lifecycle order.
- Missing history must remain visible and block dependent mutations. Historical repairs require identified evidence, explicit scope, before/after audit, and verification; never invent dates from unrelated payment or insertion timestamps.

## Restore and repair safety

- Register every new foreign-key-like field in backup dependencies/remapping, including scalar fields without Prisma relations and embedded IDs. Add coverage tests for new fields.
- Restore uses the explicit source-ID → destination-ID map. Never fall back to an old number because it happens to exist. Resolve parent maps before children; reject incomplete/ambiguous remaps and roll back.
- Rebuild the preview in the committing transaction. Use serializable isolation or equivalent locking for dependent read/modify/write operations. A GUI preview alone is not concurrency protection.
- Live recovery requires a fresh recoverable backup, evidence of the intended relationship, an audit trail and independent readback. Distinguish proven original identity from approved semantic reconciliation.

## Historical evidence and backup size

- Classify provenance by explicit source type and exact field/path. Never exempt an entire JSON snapshot simply because it is old. Copied configuration IDs may remain historical; accounts, stock, journals and operational allocation links still require strict mapping.
- Persist only account catalogue entries referenced by frozen report settings or outputs. Preserve unused legacy entries in a separate historical namespace during restore; never let original historical IDs collide with restored live lookup IDs. Accounts used by postings still require strict remapping.
- Worksheet row indexes are provenance, not database IDs. Use distinct field names; migrate legacy misnamed values only when the exact producer signature proves their meaning. Never remap a row number merely because it matches a database ID.
- Evidence-only buy-side corrections preserve their original identity namespace and must be labelled as historical during restore. `PO_ADDITIVE_COST_REPAIR` is operational: PO close and undo consume its allocation and journal links.
- Audit uploads retain filenames, ownership, byte counts and checksums, not duplicate base64 file contents. Historical compaction is a separate, reviewed, backed-up operation that preserves actual attachments and audit records.
- Planning cleanup must be company-admin scoped, backed up, previewed and transactionally rechecked. Calculated results and source sales history are separate choices; retaining sales history is the default.

## Required regression coverage

Exercise valid flow plus missing reference, existing wrong reference, cross-company reference, duplicate selection, partial and whole allocation, changed parent with child allocations, selected date before receipt, unresolved ancestry and backdated insertion. Test the gatekeeper directly, not only the form. For restores, include different destination IDs and missing map entries. Assert rejected operations do not persist partial writes, and accepted repairs preserve quantities, physical snapshots, receipt provenance and unrelated journals.

Rules are a development requirement, not proof every legacy writer is already covered. Report the checked scope and any remaining gaps explicitly.
