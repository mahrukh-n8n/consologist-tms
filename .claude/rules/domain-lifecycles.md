# Domain Lifecycles — Consologist Accountant

> Companion to the Pre-Build Design Framework (`.claude/rules/pre-build-framework.md`).
> This file contains project-specific state machines, balance equations, and invariant examples.
> Every project using the framework should have its own `domain-lifecycles.md`.

---

## Domain: Inventory (Unit Lifecycle)

### Terminal States
- **SOLD** — consumed via FIFO, revenue recognized
- **WRITTEN_OFF** — damaged, lost, disposed — GL write-off posted
- **RETURNED_TO_SUPPLIER** — PO return reversal
- **DISPOSED** — destroyed by Amazon or 3PL — GL write-off posted

### Balance Equation
```
Ordered = AtSupplier + InTransit + At3PL + Reserved + InTransitToFBA
        + AtFBA + InRemoval + Sold + WrittenOff + ReturnedToSupplier + Disposed
```

### State Machine

| From | To | Trigger | GL Entry |
|---|---|---|---|
| — | AT_SUPPLIER | PO created | Dr Advance / Cr Bank |
| AT_SUPPLIER | IN_TRANSIT | Shipment departed | None |
| IN_TRANSIT | AT_3PL | GRN confirmed (Route A) | Dr Inventory / Cr GRNI |
| IN_TRANSIT | AT_FBA | FBA receipt confirmed (Route B) | Dr Inventory / Cr GRNI |
| AT_3PL | RESERVED | Dispatch order created | None |
| RESERVED | AT_3PL | Dispatch cancelled | None |
| RESERVED | IN_TRANSIT_TO_FBA | Dispatch shipped | None |
| IN_TRANSIT_TO_FBA | AT_FBA | Amazon confirms receipt (AMAZON_INBOUND_RECEIVED movement) | None |
| AT_FBA | IN_REMOVAL | Removal order confirmed | None |
| IN_REMOVAL | AT_3PL | Sellable received at 3PL | None |
| IN_REMOVAL | WRITTEN_OFF | Damaged/unsellable write-off | Dr Write-off / Cr Inventory |
| IN_REMOVAL | DISPOSED | Disposed by Amazon | Dr Write-off / Cr Inventory |
| AT_3PL | IN_TRANSFER | Transfer out | None |
| IN_TRANSFER | AT_3PL | Transfer in | None |
| AT_3PL | WRITTEN_OFF | Adjustment/reconciliation | Dr Shortage / Cr Inventory |
| AT_3PL | RETURNED_TO_SUPPLIER | PO return | Reversal JE |
| IN_TRANSIT | WRITTEN_OFF | Lost in transit | Dr Loss / Cr Inventory |
| AT_FBA | SOLD | Customer purchase (v3) | Dr COGS / Cr Inventory |
| AT_3PL | SOLD | FBM sale direct from warehouse (SOLD_FBM movement) | Dr COGS / Cr Inventory (FIFO-exact) |
| AT_FBA | WRITTEN_OFF | FBA shortage write-off (plan CLOSED, discrepancy confirmed) | Dr Write-Off / Cr Inventory (FIFO-exact) |
| AT_FBA | (claim open) | FBA shortage claim filed (plan CLOSED) | Dr Amazon Receivable / Cr Inventory |

**No transition not in this table is permitted.** Adding a new transition requires updating this table.

### Batch Cost and FIFO Gatekeepers

- `computeInventoryBalance(companyId, filters)` in `src/lib/inventory/balance-engine.ts` is the authoritative accounting balance engine for inventory batch cost, purchased units, sold units, remaining units, residue value, and per-unit cost.
- Batch per-unit cost is derived from total debit-side inventory cost divided by positive purchased quantity. Cost-only debit entries, such as landed cost, freight, customs, inspection, shipment allocation, or other product-cost additions, increase total batch cost but do not increase purchased quantity.
- GRN valuation consumes the PO Advances balance known at receipt confirmation. PO payments, inspection fees, and PO misc costs must not be added after any GRN exists for that PO.
- Late supplier costs that are genuinely for still-unreceived inventory must use `PurchaseOrderScopedCost`, not a new ordinary PO cost row. Scoped costs are recorded through `Tools -> Buy-Side Corrections -> Remaining Cost`, debit Advances for Inventory, and are allocated only to future GRNs using the remaining ordered value snapshot captured at creation.
- Accepted overreceipt affects physical stock quantity but not ordered PO value. GRN valuation caps billable received quantity at remaining ordered quantity; legacy receipts may contain lower/zero incremental value; new actual-packing receipts credit surplus value to the existing write-off expense account separately and must not make GRNI exceed Advances.
- A confirmed GRN may be edited only while its own batches are DRAFT, no landed cost/carton/movement trail exists, the PO is not closed/cancelled, and there are no sibling GRNs for the PO. Multiple-GRN correction requires a whole-PO revaluation/repair workflow.
- Domain-linked journal entries (PO, shipment, GRN, batch, invoice, allocation, or movement records) must not be manually deleted. Use a domain reversal/correction workflow, or an explicit internal rebuild path that preserves domain invariants.
- Buy-side corrections are audited in `BuySideCorrection`. Source replacement follows Option A: create a REVERSING JE for the old linked JE, create the corrected JE, update the original domain row to point at the corrected JE/account snapshots, and keep old/new snapshots in the audit row.
- `previewFifoForSale()` and `consumeFifoForSale()` in `src/lib/batch/fifo-consume.ts` are the shared FIFO sale gatekeepers. Preview and actual posting must use the same batch loader and cost basis.
- FIFO sale cost must consume oldest FINAL batches first, include all cost-only inventory debit additions, and create one COGS journal entry per consumed batch when posting.
- FIFO date is **not** numeric `batchId` and not lexical `batchNumber`. The shared rule is: earliest confirmed GRN date linked to the batch; if no GRN exists, fall back to `Batch.createdAt`. Tie-break by `batchId`, then lot `createdAt`, then lot id.
- `src/lib/inventory/carton-lot-fifo.ts` is the shared physical-lot FIFO sorter. Any code that chooses carton lots across batches must use `sortCartonLotsByBatchFifo()` or a wrapper that delegates to it.
- UI, MCP, Amazon custom transaction pipeline, FBM, dispatch, warehouse transfer, and any future sale/write-off preview must not reimplement FIFO ordering or costing inline. If a caller needs a different response shape, add an adapter around the FIFO gatekeeper, not a second FIFO engine.
- `/record-sale`, `/3pl-ledger/fbm-sale`, MCP FBM posting, and Amazon custom transaction pipeline COGS posting all go through `previewFifoForSale()` / `consumeFifoForSale()`. Divergence between preview and posting order is a bug.
- User-facing batch labels must show `Batch.batchNumber` (the business batch number), not the internal database `batchId`. Internal IDs may be kept as keys only.
- `inventory.list` and `inventory.get` may expose different surfaces (list summary vs batch drill-down), but accounting cost fields must come from `computeInventoryBalance`, while physical location/remaining quantity fields must come from carton-lot physical summaries. If both are exposed, label accounting stock separately (for example `accountingRemainingUnits`) and keep user-facing `remainingUnits` aligned with physical carton-lot stock.

### Amazon Custom Transaction Quantity Rule

- FNSKU/Product Based `NET QTY SOLD` is derived from the staged FNSKU workbook, not recalculated from raw rows downstream.
- Amazon `Adjustment` row quantity sign is driven by the canonical row `totalAmount` from the source `total` column, not by the quantity column sign.
- Positive or zero `Adjustment.totalAmount` keeps the normal behavior: add the adjustment quantity into signed Adjustments. Negative `Adjustment.totalAmount` means Amazon reversed a recovery, so subtract the absolute adjustment quantity from signed Adjustments.
- This sign reversal applies only to true Amazon Adjustment rows, not every non-order/non-refund fee row that displays in the Adjustments column.

---

## Domain: Shipments

### Terminal States
- **CLOSED** — all costs allocated, clearing balances zero, batches finalized (DRAFT -> FINAL)
- **CANCELLED** — shipment cancelled before departure (only from BOOKED)

Note: DELIVERED is no longer terminal — it is the prerequisite state for CLOSED.

### Balance Equation
```
Total = Booked + InTransit + Customs + Delayed + Delivered + Closed + Cancelled
```

### State Machine

| From | To | Trigger | GL Entry |
|---|---|---|---|
| BOOKED | IN_TRANSIT | Shipment departed | None |
| BOOKED | CANCELLED | Shipment cancelled (no costs allocated) | None |
| IN_TRANSIT | CUSTOMS | Arrived at customs | None |
| IN_TRANSIT | DELAYED | Shipment delayed | None |
| IN_TRANSIT | DELIVERED | Direct delivery | None |
| CUSTOMS | DELIVERED | Customs cleared | None |
| DELAYED | IN_TRANSIT | Delay resolved, back in transit | None |
| DELAYED | CUSTOMS | Delayed shipment at customs | None |
| DELAYED | DELIVERED | Delayed shipment delivered | None |
| DELIVERED | CLOSED | User closes shipment (all costs allocated, batches finalized) | None (batch status change only) |

**No transition not in this table is permitted.** Adding a new transition requires updating this table.

### Invariants
- CANCELLED only allowed from BOOKED — ensures no costs have been allocated
- CLOSED requires: status DELIVERED, no DRAFT GRNs, at least 1 confirmed GRN, freight clearing balance = 0, customs clearing balance = 0
- Closing atomically transitions all linked DRAFT batches to FINAL
- No freight or customs costs can be added to a CLOSED shipment
- Freight and customs clearing account currency must match the shipment item's inventory account currency. For mixed inventory-currency shipments, split costs/allocation by currency or require an explicit override; never silently route EUR inventory costs through a GBP clearing account just because GBP is the business currency.
- A mixed-currency shipment is fixed by splitting it into one shipment per inventory currency (remove the moving lines while BOOKED, add them to a new shipment). Item add/remove is UI-only — no MCP tool exists for it. Step-by-step: `.agents/skills/consologist-accountant-mcp/references/split-shipment-by-currency.md`.
- **One shipment = one inventory-account currency (gatekeeper-enforced).** `assertSingleShipmentCurrency` / `assertSingleShipmentCurrencyForPOs` in `src/lib/shipments/shipment-item-currency.ts` blocks creating a shipment whose linked POs span inventory currencies, adding a line in a second currency, and adding all PO lines in a second currency. All three write points throw with the split instruction; MCP maps it to `VALIDATION_ERROR`. Legacy mixed shipments (created before the guard) stay readable but reject further line writes until split.
- The same guard runs in the GUI create action **before** the approval gate, so a maker with approval routing gets the error immediately instead of a pending approval that can never execute.
- PO close requires all linked shipments to be CLOSED first
- ShipmentItem removal blocked when status != BOOKED or GRN lines reference the item
- Archive (soft-delete) blocked when journal entries are linked

### Batch Finalization
- DRAFT -> FINAL now triggered by shipment close (or PO close for no-shipment POs), not at GRN confirmation
- This prevents premature FIFO consumption before landed costs are fully allocated
- FINAL status only unlocks FIFO consumption. It does not freeze the cost basis shown in previews; the FIFO gatekeeper still reads the complete journal-entry cost trail for the batch, including later valid cost-only debit additions.

---

## Domain: Carton Lots (Physical Inventory Truth)

> Added by Brainstorm 027. Carton lots bridge the GL pipeline (batch/FIFO/cost) and the operational pipeline (movements/location/packaging). The carton lot is the **authoritative physical-inventory balance source** — all balance queries read from lots, not movement aggregation.

### Objective

Track everything about every unit of inventory from entry to exit. The carton lot carries the batch thread (cost linkage), the box identity (immutable packaging snapshot), and the location through every internal move. No gaps, no approximations, no disconnected views.

### Terminal States
- **CONSUMED** — units fully dispatched, sold, or used (leaves inventory)
- **WRITTEN_OFF** — shortage, damage, disposal (leaves inventory via GL write-off)
- **REPACKED** — source lot closed, replaced by new lots via repack operation

### Balance Equation

```
For any (companyId, productId, locationId):
  PhysicalOnHand = sum(remainingUnits WHERE status IN (ACTIVE, RESERVED) AND location = locationId)
  Available = sum(remainingUnits WHERE status = ACTIVE AND location = locationId)
  Reserved = sum(remainingUnits WHERE status = RESERVED AND location = locationId)
  InTransit = sum(remainingUnits WHERE status = IN_TRANSIT)

Global per product:
  TotalUnits = PhysicalAt3PL + PhysicalAtFBA + InTransit
  This must equal: sum(batch.unitsPurchased - batch.unitsSold) across all batches for this product
```

### State Machine

| From | To | Trigger | CartonTxn Type |
|---|---|---|---|
| — | ACTIVE | GRN confirmed (lot created at warehouse/FBA) | CREATED |
| — | ACTIVE | Manual batch finalized (direct JE route, lot assigned to location) | CREATED |
| — | ACTIVE | Repack (new lot created from source lots) | CREATED_FROM_REPACK |
| — | ACTIVE | Amazon removal inbound (lot at 3PL) | CREATED_FROM_REMOVAL |
| — | ACTIVE | Transfer in (lot created at destination warehouse) | TRANSFERRED_IN |
| ACTIVE | RESERVED | Dispatch reserved or FBM order created | RESERVED |
| RESERVED | ACTIVE | Dispatch/FBM cancelled | RELEASED |
| RESERVED | IN_TRANSIT | Dispatch shipped | DISPATCHED |
| ACTIVE | IN_TRANSIT | Dispatch shipped (direct, no reservation step) | DISPATCHED |
| IN_TRANSIT | ACTIVE | FBA receipt confirmed (lot now at FBA center) | FBA_RECEIVED |
| ACTIVE | CONSUMED | FBM sale posted (units leave business) | SOLD |
| ACTIVE | CONSUMED | Dispatch fully consumed (full carton) | DISPATCHED |
| ACTIVE | CONSUMED | Transfer out (lot consumed at source) | TRANSFERRED_OUT |
| ACTIVE | ACTIVE | Partial split — source lot reduced, new remainder lot created with SPLIT txn | SPLIT |
| ACTIVE | WRITTEN_OFF | Shortage / damage / disposal | WRITTEN_OFF |
| ACTIVE | REPACKED | Source lot consumed by repack operation | REPACKED_SOURCE |
| ACTIVE | CONSUMED | PO return — stock physically leaves to supplier | RETURNED_OUT |
| IN_TRANSIT | WRITTEN_OFF | FBA discrepancy write-off (partial qty) | WRITTEN_OFF |

**No transition not in this table is permitted.** Adding a new transition requires updating this table.

### Invariants
- Each carton lot belongs to exactly one batch and one product (schema FK)
- Repack cannot mix batches — all source lots must share same batchId AND same productId
- `lot.remainingUnits >= 0` always (gatekeeper enforced)
- `lot.totalUnits` is immutable after creation
- Template edits never rewrite lot snapshot fields (snapshots are immutable)
- Executed inventory events are reversed via carton txns, not deleted
- `sum(lot.remainingUnits at location)` = `getInventoryBalance(PHYSICAL_ON_HAND)` — one engine, all pages
- Repack net-zero: sum of consumed source units = sum of created target units
- Open cartons (lots with `remainingUnits < totalUnits`) remain visible inventory with trackable state
- Every lot has a CartonTxn at creation — including split remainder lots (SPLIT txn with sourceCartonLotId)
- `transferId` must be set on all TRANSFERRED_OUT/IN txns; `movementId` on adjustment txns; `purchaseOrderId` on RETURNED_OUT txns
- FBM sales MUST consume carton lots (call `consumeLotsForFbm`) — sold units must not remain ACTIVE
- End-consumer sales may decrement active lot units directly with a SOLD carton txn; split-first is reserved for physical allocation/movement where the taken portion needs its own lot identity
- `confirmFbaReceipt` must scope IN_TRANSIT lot queries to the specific dispatch order (not all company lots)
- Multi-source repack: `sourceCartonLotId = null` on target lots; `repackGroupId` is the bilateral link
- Carton-lot FIFO ordering must use the shared FIFO date rule in `carton-lot-fifo.ts`; never order operational consumption by `batchId ASC` or `batchNumber ASC`.

### Key Relationships

```
Shipment
  └── ShipmentItem (product, qty)
        ├── BoxAllocation: 10 x Master200 → 10 carton lots at GRN (same batch)
        └── BoxAllocation: 5 x Master100  →  5 carton lots at GRN (same batch)

One batch → many carton lots (one per box config allocation row)
One carton lot → one batch (cost thread), one product, one location
```

### How Carton Lots Connect to GL Pipeline

- **Entry:** GRN creates batch (GL) + carton lots (operational). `lot.batchId = batch.id`.
- **Internal moves:** Only carton lots change (status, location). No GL entries. Batch stays untouched.
- **Exit:** FIFO consumption creates JEs (GL) + carton lots consumed (operational). Both pipelines updated atomically.
- **Cross-check:** `sum(lot.remainingUnits)` per product must equal `sum(batch.remaining)` per product. Divergence = bug.

### Cancellation Rules
- Dispatch cancelled → RELEASED txns on reserved lots, lots → ACTIVE. Movement marked CANCELLED (not deleted).
- FBM order cancelled → same pattern. No deletion.
- GRN re-confirmation → blocked if lots have been consumed/reserved. If all lots ACTIVE, reverse and recreate.
- `postFbmOrder()` → creates new SOLD movement + CONSUMED lot txn. Does not mutate existing reservation in-place.

---

## Domain: Dispatch Orders

### Terminal States
- **CLOSED** — Amazon receipt confirmed, qty matched or discrepancy resolved (write-off or claim posted)
- **CANCELLED** — dispatch cancelled before shipping (only from RESERVED)

### State Machine

| From | To | Trigger | GL Entry | Carton Lot Effect |
|---|---|---|---|---|
| RESERVED | SHIPPED | Dispatch shipped | None | Source lots → IN_TRANSIT |
| SHIPPED | AWAITING_FBA_CONFIRMATION | Amazon receipt pending | None | None (lots stay IN_TRANSIT) |
| AWAITING_FBA_CONFIRMATION | CLOSED | Amazon receipt confirmed (qty matched or discrepancy resolved) | Write-off/claim JE if discrepancy | IN_TRANSIT lots → ACTIVE at FBA; discrepancy lots → WRITTEN_OFF |
| RESERVED | CANCELLED | Dispatch cancelled | None | Reserved lots → ACTIVE (RELEASED txn, not deleted) |

**No transition not in this table is permitted.** Adding a new transition requires updating this table.

### Invariants
- AWAITING_FBA_CONFIRMATION only allowed from SHIPPED
- CLOSED requires: AWAITING_FBA_CONFIRMATION status + Amazon receipt confirmed (qtyReceivedByAmz populated)
- Discrepancy ≥ 1 unit: must resolve as write-off (Dr Write-Off / Cr Inventory) or claim (Dr Amazon Receivable / Cr Inventory) before CLOSED
- FBA receipt confirmation MUST create AMAZON_INBOUND_RECEIVED carton transactions (not just status field updates)

- Dispatch allocates against actual carton lots at the source warehouse, not box config templates
- Packing plan rows are `boxConfigId + numberOfBoxes + packedUnits` (unchanged)
- Per-row invariant: `packedUnits = numberOfBoxes * unitsPerBox`; partial final boxes are not allowed.
- Dispatch invariant: `sum(packedUnits) = qtyReserved`
- Auto-suggestion and server reservation consume lots from oldest FIFO batches at the source 3PL warehouse using the shared carton-lot FIFO sorter.
- Dispatch preview and reservation must call the same strict complete-box FIFO planner. The planner consumes FIFO batches in order and must not skip older batches to make an exact total from newer box configurations.
- The strict planner may allocate from a lot only in multiples of that lot's `snapshotUnitsPerBox`; reconstruction must round capped candidates down to whole-carton units before accepting them.
- A selected/recreated box config can match an older source lot by immutable snapshot equivalence (units, weight, dimensions, and units), not only by `boxConfigId`.
- Same-session repacked lot IDs are only a tie-breaker inside their own FIFO batch; they must never jump ahead of an older batch.
- Explicit manual source selection is the operational exception to FIFO for 3PL-to-Amazon dispatch. Manual mode must require the operator to select ACTIVE source carton lots and whole-box counts, must make the non-FIFO choice visible/auditable, and must reject selections whose packed units do not exactly equal the dispatch quantity.
- If operator wants a different box config than source lots have, explicit repack is required first
- Lot split during dispatch is allowed only on complete-carton boundaries. Non-boundary quantities require repack into a matching custom box configuration first.
- Cancellation creates RELEASED carton txns — no movement or lot deletion

---

## Domain: Purchase Orders

### Lifecycle
- DRAFT → SENT → IN_TRANSIT → PARTIAL → RECEIVED → CLOSED
- DRAFT → CANCELLED
- Any status → RETURNED (reversal JEs)

### PO Close Prerequisites (two paths)

**Path A: Linked shipments exist**
- PO status = RECEIVED
- All linked shipments = CLOSED (shipment close already verified freight/customs clearing = 0)
- No DRAFT GRNs
- At least 1 confirmed GRN line exists
- GRNI Clearing balance = 0 (validated post-close-JE)

**Path B: No linked shipments (domestic PO)**
- PO status = RECEIVED
- No DRAFT GRNs
- At least 1 confirmed GRN line exists
- GRNI Clearing balance = 0 (validated post-close-JE)
- On close: all DRAFT batches → FINAL atomically (unlocks FIFO consumption)

**GL entry:** Dr GRNI Clearing / Cr Advances for Inventory
**Formula:** `closingAmount = actual GRNI Clearing balance` — computed from confirmed GRN posting JEs (`Dr Inventory / Cr GRNI`) and cleared against the Advances for Inventory accounts recorded on PO payments, inspection fees, misc costs, and active remaining scoped costs.
**Invariant:** derived Advances account-currency balance must equal GRNI account-currency balance within tolerance. If Advances are higher or lower than GRNI, PO close blocks; it must not post the difference to Inventory.
**Correction rule:** A PO-close mismatch is an upstream data/formula problem, not a closing-entry opportunity. If batches are still DRAFT and unconsumed, repair/revalue the affected GRN/PO as an audited whole-domain action. If batches are FINAL or consumed/sold, post explicit adjustment/reclassification entries with audit notes; do not silently rewrite historical inventory.

### Invariants
- CANCELLED only from DRAFT or SENT (gatekeeper enforced)
- CLOSED only from RECEIVED (dedicated `closePurchaseOrder()` action)
- PO close is the universal gate for batch finalization — even no-shipment POs must close before batches become FINAL
- Batch finalization: DRAFT → FINAL happens at shipment close (Path A) or PO close (Path B)
- GRNI Clearing currency must match the inventory account currency used by the received lines. If a GRN contains multiple inventory currencies, split the GRN by inventory currency or require an explicit override.
- PO Advances accounts used by PO payments, inspection fees, and PO-level misc costs must match the related inventory/GRNI currency. The payment bank/AP/launch-fund credit account may be in a different currency; the Advances debit account is the inventory valuation bridge and must be in the inventory account currency.
- PO close derives GRNI and Advances accounts from historical GRNs and PO cost journals. Users do not select clearing account IDs during close.
- PO close includes active `PurchaseOrderScopedCost` rows in derived Advances. This keeps late remaining-cost GRN valuation and close clearing on the same source of truth.
- If GRNI or Advances historical account snapshots are missing, mismatched, wrong subtype, wrong currency, or internally inconsistent with linked journal entries, PO close blocks with a correction message instead of posting to a guessed account.
- Purchase-invoice approval/payment is not part of the current buy-side close model. The active model is PO cost -> Advances, GRN -> Inventory/GRNI, PO close -> GRNI/Advances. A separate supplier-invoice Dr GRNI / Cr AP flow would double-clear GRNI unless redesigned end to end.
- **Editing blocked when:** PO status ≠ DRAFT, OR linked shipments exist, OR linked GRNs exist
  - GUI: `editEligible = status === "DRAFT" && !hasLinkedShipments && !hasLinkedGRNs`
  - Gatekeeper: `hasLinkedShipmentItemsOrGRNs()` check inside `updatePurchaseOrder()`
  - Payments/inspections do NOT block editing — they have no structural impact on PO lines
- **Edit guards execute in order:** DRAFT check (primary) → shipment check → GRN check (defense-in-depth)

---

## Domain: Pending Approvals

### Terminal States
- **APPROVED** — reviewer approved, payload executed through gatekeeper, real entity created
- **REJECTED** — reviewer rejected with reason, no entity exists, nothing to clean up
- **CANCELLED** — maker cancelled own request before review, no entity exists

### State Machine

| From | To | Trigger | Side Effect |
|---|---|---|---|
| PENDING | APPROVED | Reviewer approves | Deserialize payload -> execute gatekeeper -> create real entity -> set entityId |
| PENDING | REJECTED | Reviewer rejects with reason | None -- no entity exists |
| PENDING | CANCELLED | Maker cancels own request | None -- no entity exists |

**No transition not in this table is permitted.** Adding a new transition requires updating this table.

### Invariants
- Only maker or admin can cancel PENDING
- Only reviewer/admin can approve/reject PENDING
- **No entity exists until APPROVED** -- payload stored as JSON in PendingApproval
- On approval: handler.execute() deserializes payload, calls domain gatekeeper, creates real entity
- Rejection and cancellation have zero side effects (nothing to clean up)
- SUPER_ADMIN bypasses approval entirely (never creates PendingApproval)

---

## Domain: Financial Documents

### Invoice Lifecycle
- Sales/operational invoice lifecycle: DRAFT → APPROVED (JE created) → PAID (payment JE) → CLOSED
- DRAFT → CANCELLED (no JE)
- APPROVED → DISPUTED (JE reversed or held) → RESOLVED → PAID
- Every approved invoice must reach PAID or CANCELLED. No indefinite APPROVED state without aging alerts.
- Buy-side purchase invoices are inactive in the current PO close lifecycle. Do not introduce a purchase-invoice GRNI/AP clearing path without redesigning PO close and GRNI aging together.

### Payment Lifecycle
- Every payment creates a JE. No payment without GL impact.
- Partial payments tracked — outstanding balance computable at all times.
- Full payment → document status = PAID.

---

## Domain: Journal Entries (GL Traceability)

### Domain FK Tagging

Every journal entry is tagged with the domain entity that created it. These FKs are optional and nullable, but best-practice gatekeepers should populate at least one:

| FK Field | Set By | Purpose |
|---|---|---|
| `purchaseOrderId` | PO gatekeepers (payments, costs, close) | Links GL entry to originating PO |
| `shipmentId` | Shipment gatekeepers (freight, customs) | Links GL entry to originating Shipment |
| `goodsReceiptId` | GRN gatekeepers (confirmation, landed costs) | Links GL entry to originating GRN |

**Rules:**
- A JE may have 0, 1, 2, or all 3 FKs populated
- GRN JEs typically have all three (PO + Shipment + GRN)
- Shipment cost JEs have only `shipmentId`
- PO cost JEs have only `purchaseOrderId`
- These FKs do NOT affect JE validity — a JE with no FKs is still valid, just not traceable
- UI displays linked entities as "Part of: PO XXX, Shipment YYY, GRN ZZZ" with clickable links
- Backup restores remap all three FKs via `journal-entries` source
- Manual delete is only for standalone journal entries. If a JE has domain FKs or is referenced by PO costs, shipment costs, GRN lines, invoices, allocations, payments, or inventory reconciliation, deletion must block and direct the user to the domain correction/reversal workflow.

---

## Domain: MCP API Keys

### Terminal States
- **REVOKED** — key invalidated by user; rejected immediately on next subprocess boot attempt

### State Machine

| From | To | Trigger | Side Effect |
|---|---|---|---|
| — | ACTIVE | User generates key from Settings → API Keys | Hash stored (bcrypt), raw key shown once |
| ACTIVE | REVOKED | User revokes key | `revokedAt` stamped; validator rejects on next use |

**No transition not in this table is permitted.** There is no "suspended" or "expired" state — a key is either active or permanently revoked. Regeneration creates a new key (new row, ACTIVE); the old key is separately revoked.

### Invariants
- Raw key shown to user exactly once at creation — never stored, never retrievable
- `keyHash` stored as bcrypt; validated by constant-time compare on each subprocess boot
- Multiple ACTIVE keys per user are allowed (one per client — e.g. Claude Desktop, Claude Code)
- Revocation is immediate — no grace window, no caching
- Revoking a key does not terminate an already-running subprocess; it blocks the next boot
- Key prefix (last 4 chars of raw key) stored as `keyPrefix` for display — not sufficient to authenticate
- `lastUsedAt` updated on each successful subprocess boot (not per tool call — once per session)
- Keys belong to a user, not a company — user must also belong to the target company (validated at boot via `apiKeyValidator`)

### Balance Equation
```
Total keys created = Active + Revoked
```
No key is ever deleted — revoked keys are retained for audit trail.

---

## Domain: MCP Tool Invocations (Audit Trail Only)

MCP tool invocations are not domain entities with their own lifecycle — they are append-only audit log entries written to `WriteAuditLog` with `source = "mcp"`. They have no state machine. Each invocation produces exactly one audit entry, regardless of outcome.

### Invariants
- Every tool invocation (success, error, pending-approval, permission-denied) emits exactly one audit entry
- Audit entries are immutable — never updated, never deleted
- `durationMs` is always present — measured around handler + gatekeeper execution
- `source = "mcp"` on all MCP-originated entries — distinguishes from web app entries
- `status` is one of: `"success"` | `"error"` | `"pending-approval"` | `"permission-denied"` | `"write-disabled"`
- For `status = "pending-approval"`: `args` contains the serialized tool input; `resultDetail` contains `pendingApprovalId`
- For `status = "error"`: `errorDetail` contains the gatekeeper error message (not a stack trace)
- Auth failures at subprocess boot are logged separately (boot log, not per-invocation audit)

---

## Project-Specific Invariant Examples

These are recurring invariants in this codebase. Use as reference during Phase 5 of the framework.

### Balance Equations
- `sum(grnAmounts) = totalAmount` — allocation totals must match cost totals
- `sum(lineAmounts) = grnAmount` — individual JE lines must sum to GRN allocation
- `totalAmount > 0` — no zero-value allocations
- FIFO write-off gate: `createStockAdjustment SHORTAGE` requires `sum(FINAL batch qty) ≥ write-off qty`; throws `"Insufficient finalized units: X finalized, Y requested"` otherwise

### Currency & Precision
- All currency math uses Decimal.js with 28-digit precision, ROUND_HALF_UP
- Precision must be consistent across preview, submission, and storage — never `.toFixed(2)` in UI but `.toFixed(4)` in backend
- Currency rate validation: same currency as business → rate = 1.0; different → rate ≠ 1.0
- JE balance equation: `debitAmountAC × rateDebit = businessAmount = creditAmountAC / rateCredit`
- Buy-side inventory clearing accounts are currency-specific operational accounts. Match clearing account currency to inventory account currency, while reports continue to use business-currency amounts from journal conversions.

### Account Validation
- Every account picker must use `<AccountSelect>` with subtype filtering
- Missing clearing accounts → `<ClearingAccountMissingAlert>` + disabled submit
- Gatekeeper validates account subtypes before posting (`assertAccountSubtype`)

---

## Project-Specific Anti-Patterns

| Anti-Pattern | What happens | Instead |
|---|---|---|
| "Preview is approximate" | User sees £500, actual is £499.97 | Same Decimal.js precision everywhere |
| "Manual mode, no sum check" | Wrong amounts, cryptic server error | Validate sum client-side before submit |
| Inline `.mul(rate)` math | Formula changes need N updates | Use `calculateAmount()` from shared module |
| Plain `<Input>` for rate | No auto-fetch, no timestamp, no validation | Use `<CurrencyConversion>` component |
| Direct `prisma.create()` for gatekept domain | Bypasses invariant checks | Call the domain mutation gatekeeper |

## Admin buy-side undo (audited exception)

`PO CLOSED/RECEIVED/PARTIAL → SENT`, linked `Shipment CLOSED → DELIVERED`, generated receipts/batches/journals → deleted with immutable BuySideCorrection snapshot. This is one serializable admin-only operation through `previewBuySideUndo` / `commitBuySideUndo`; requires a current preview hash. All shipments and downstream inventory are scanned. Historical consumption blocks regardless of net returns; locked periods and unsupported/shared external dependencies block. Source costs/payments, shipment items and voyage facts are preserved. Physical locations must be reconstructed from the audit during the normal receipt rebuild. Normal lifecycle transitions remain unchanged.

## Scheduled jobs

Company schedule: absent → active ↔ inactive → absent. Removing configuration preserves
backups, audit entries and run history. Settings and execution share a company/job lock.
Run: RUNNING → SUCCESS / PARTIAL / FAILED; abandoned RUNNING → INTERRUPTED. A unique
company/kind/occurrence claim is committed with next-run advancement before external
effects. Interrupted occurrences are not replayed automatically. ARCHIVED records with
kind backup-configuration preserve superseded legacy configuration during migration.
Restore imports scheduling settings disabled and never imports operational run claims.
Retention removes superseded scheduled copies only after N complete copies exist; manual
and safety backups are excluded. Large database blobs may use durable filesystem fallback.

## Receipt discrepancies and recovered units (2026-10-16)

New shipment GRNs derive expected units from the linked delivered shipment and good stock from explicit actual packing. Missing/damaged units are finalized as absorb, expense, supplier claim or forwarder claim; they are not another pending delivery. `accountedQty` records settled shipment quantity; `receivedQty` retains its historical gross meaning. Accepted usable surplus is separately funded by a credit to the existing Inventory Write-Off Expense account; GRNI never includes surplus value.

`ReceiptDiscrepancy`: unresolved → partially recovered → fully recovered, derived from quantity minus recoveredQuantity. Each recovery appends a `ReceiptRecovery` with selected date and unique request key. Recovery creates a new cost layer, preserving original receipt, original lot evidence and consumed batch costs. Claims/write-offs reverse original recorded carrying values; absorbed loss recovery credits the selected write-off account without repricing old units. Source batches must be FINAL. Ordinary buy-side undo is blocked for these linked receipt records.

Additional transitions:
- Surplus accepted → AT_3PL / AT_FBA: Dr Inventory / Cr existing Write-Off Expense.
- Shortage recovered → AT_3PL / AT_FBA: Dr Inventory / Cr original claim/write-off (absorbed loss uses selected write-off account).

Amazon receipt shortage allocation and journal batch selection use the same actual dispatched lots, sorted by the canonical FIFO helper. FBA surplus/recovery lots use `isUnitOnly`: units are consumable but have no invented cartons, weights or dimensions. Splits, sale adjustments and storage history preserve zero cartons. New standalone receipt layers carry `effectiveReceiptDate` for FIFO ordering; this field does not backfill historical batches.


## Fiscal year records

- Creation → OPEN. Required real inclusive calendar dates satisfy start ≤ end and do not overlap any period for that company (including LOCKED years).
- OPEN → LOCKED through manual settings lock (no journals) or existing year-end close (closing journals and lock together). LOCKED is terminal for these tools; no date editing, deletion, or reopening is exposed.
- Fiscal-year setup/lock mutations share the company posting advisory lock and a company-row lock before checking dates/state. Concurrent empty-calendar creation cannot produce overlapping records.
- Settings GUI and `fiscal_year.list/get/create/lock` share schemas, presenters and gatekeepers. Direct settings write permission is required; approval-required users are denied before MCP approval routing.
- Existing fiscal-year model and backup references are unchanged. Year boundaries are not inferred from Company Settings and creating a record does not post journals.
