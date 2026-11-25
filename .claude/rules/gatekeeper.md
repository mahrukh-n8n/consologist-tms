---
description: "Gatekeeper architecture: every data mutation, UI input, and shared calculation flows through a single validated gateway. Prevents bypass bugs, enforces invariants, eliminates drift."
alwaysApply: true
---

# Gatekeeper Architecture

Every repeating concern in the application — data writes, UI inputs, business calculations — must flow through a **single, validated gateway**. No caller may bypass a gatekeeper. No pattern may exist in 2+ places without a central home.

This rule applies to three domains:

| Domain | Gatekeeper Lives In | Examples |
|---|---|---|
| Data Mutations | `src/lib/mutations/` | Journal entries, PO creation, payments |
| UI Components | `src/components/ui/` | Account pickers, currency inputs, table filters |
| Shared Logic | `src/lib/{domain}/` | Currency conversion math, balance equations, status transitions |

---

## Domain 1: Data Mutations

### The Three Layers

```
UI / API route / cron job          ← Layer 1: Entry Point (thin)
       │
   Server Action                   ← Layer 2: Orchestrator (auth, parse, revalidate)
       │
   Domain Gatekeeper               ← Layer 3: Invariant Enforcer (validation, business rules, DB write)
```

**Layer 1 — Entry Point:** Form submissions, API calls, background jobs. Zero business logic.

**Layer 2 — Orchestrator (Server Action):**
- Authenticate + authorize
- Parse / deserialize input (Zod, FormData → typed object)
- Call the domain gatekeeper
- Revalidate paths / return response
- **Must not** contain business rules, validation logic, or direct DB writes

**Layer 3 — Domain Gatekeeper:**
- The **only** code that touches the database for its domain
- Enforces every invariant (balance equations, stock levels, status transitions)
- Runs inside a transaction when multiple writes are atomic
- Throws on violation — orchestrator catches and returns error
- **All paths converge here** — UI forms, bulk imports, seeds, migrations

### WRONG — Validation in caller, gatekeeper is dumb pipe

```ts
// ── server action (caller) ──────────────────────────────
export async function addPayment(formData: FormData) {
  const amount = new Decimal(formData.get("amount"));
  const rate = new Decimal(formData.get("rate"));
  const businessAmt = amount.mul(rate);  // ❌ inline math

  // ❌ Balance check here — only protects THIS caller
  if (!businessAmt.equals(amount.mul(rate))) throw new Error("Unbalanced");

  const je = await tx.journalEntry.create({ data: { ... } });
  await postToLedger(tx, { id: je.id, amount: je.amount, ... });  // ❌ no validation inside
}

// ── seed script ─────────────────────────────────────────
// ❌ No balance check — goes straight to DB
const je = await prisma.journalEntry.create({ data: { ... } });
await postToLedger(prisma, { id: je.id, amount: je.amount, ... });
```

**What goes wrong:** The seed script and import tool never check the balance equation. Unbalanced entries reach the database. The bug only surfaces weeks later when reports don't reconcile.

### RIGHT — Gatekeeper enforces invariants, all callers use it

```ts
// ── gatekeeper: src/lib/mutations/journal.ts ────────────
export async function createJournalEntry(tx: PrismaClient, input: CreateJournalInput) {
  const businessAmt = calculateAmount(input.debitAmountAC, input.rateDebit);  // ✅ shared math

  const balanceCheck = validateBalanceEquation(...);  // ✅ runs for EVERY caller
  if (!balanceCheck.valid) throw new Error(balanceCheck.error);

  const je = await tx.journalEntry.create({ data: { ... } });  // ✅ all DB writes here
  await postToLedger(tx, { ... });
  return je;
}

// ── server action (thin orchestrator) ───────────────────
export async function addPayment(formData: FormData) {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "journal");  // ✅ V4 permission check
  const data = paymentSchema.parse(formData);

  const je = await prisma.$transaction((tx) =>
    createJournalEntry(tx, { ...data })  // ✅ calls gatekeeper
  );
  revalidatePath("/purchase-orders");
}

// ── seed script ─────────────────────────────────────────
await prisma.$transaction((tx) =>
  createJournalEntry(tx, { ... })  // ✅ same gatekeeper, same validation
);
```

---

## Deletion gatekeeper

Business deletions use `deleteWithAudit` through a domain adapter. Read `.claude/rules/deletion-audit.md` before adding or changing any delete, including rebuilds and bulk operations. Full original snapshots, actor/reason and removal must commit atomically; asynchronous middleware is not sufficient.

## Domain 2: UI Components

Every distinct input type has **one** canonical component. No page may reinvent the wheel.

| Input Type | Gatekeeper Component | Never Use Instead |
|---|---|---|
| Account picker | `<AccountSelect>` | Bare `<SearchableSelect>`, `<Input>`, custom combobox |
| Currency code | `<CurrencySelect>` | `<Input>`, `<Select>`, hardcoded dropdown |
| Conversion rate | `<CurrencyConversion>` | `<Input type="number">`, manual fetch + input |
| Any dropdown | `<SearchableSelect>` | Bare shadcn `<Select>` |
| Table headers | `<FilterableHead>` + `useFilterableTable` | Manual useState for filters |

### WRONG — Reinventing the account picker

```tsx
// ❌ Page A: hand-rolled combobox
<Select onValueChange={setAccount}>
  {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.accountName}</SelectItem>)}
</Select>

// ❌ Page B: different hand-rolled combobox with slightly different display
<SearchableSelect
  options={accounts.map(a => ({ value: String(a.id), label: a.accountName }))}
  onChange={setAccount}
/>

// ❌ Page C: yet another variant, this time showing account number
<SearchableSelect
  options={accounts.map(a => ({ value: String(a.id), label: `#${a.id} ${a.accountName}` }))}
  onChange={setAccount}
/>
```

**What goes wrong:** Three pages show accounts differently. One shows `#id`, two don't. One filters by type, others don't. User experience is inconsistent. Bug fix to display logic needs 3 changes.

### RIGHT — One component, used everywhere

```tsx
// ✅ All three pages — identical behavior, display, filtering
<AccountSelect accounts={accounts} value={accountId} onValueChange={setAccountId} />
```

### WRONG — Manual conversion rate input

```tsx
// ❌ Each form fetches rates differently, formats differently, validates differently
<Input type="number" value={rate} onChange={e => setRate(e.target.value)} />
<span>Rate fetched at {new Date().toLocaleTimeString()}</span>
```

### RIGHT — CurrencyConversion component handles everything

```tsx
// ✅ Auto-fetches, shows timestamp, allows manual override, consistent everywhere
{accountCurrency !== businessCurrency && (
  <CurrencyConversion
    from={accountCurrency} to={businessCurrency}
    onRateChange={setRate} allowManualOverride
  />
)}
```

---

## Domain 3: Shared Calculation Logic

Business formulas must live in **one function** and be called — never reimplemented inline.

| Calculation | Gatekeeper Function | Location |
|---|---|---|
| Debit → business currency | `calculateAmount()` | `src/lib/currency/conversion.ts` |
| Business → credit currency | `calculateCreditAmount()` | `src/lib/currency/conversion.ts` |
| Balance equation check | `validateBalanceEquation()` | `src/lib/currency/balance-equation.ts` |
| Inventory batch balance/per-unit cost | `computeInventoryBalance()` | `src/lib/inventory/balance-engine.ts` |
| FIFO sale preview and posting | `previewFifoForSale()` + `consumeFifoForSale()` | `src/lib/batch/fifo-consume.ts` |
| Buy-side cost correction preview/apply | `previewPOCostCorrection()`, `applyPOCostCorrection()`, `createRemainingReceiptCost()`, `previewShipmentCostCorrection()`, `applyShipmentCostCorrection()` | `src/lib/buy-side/corrections.ts` |
| Purchase Entry creation (inventory-only) | `gkCreatePurchaseEntry()` | `src/lib/mutations/purchase-entry.ts` |
| Purchase Entry Batch repair (malformed non-inventory DRAFT batch) | `previewPurchaseEntryBatchRepair()`, `commitPurchaseEntryBatchRepair()` | `src/lib/inventory/purchase-entry-batch-repair.ts` |
| FX residual detection | Threshold logic (IAS 21) | `src/lib/currency/` |
| Journal series generation | `generateSeries()` | `src/lib/journal/series.ts` |

### WRONG — Inline math scattered across callers

```ts
// ❌ server action A
const businessAmt = amount.mul(rate);

// ❌ server action B (same formula, different variable names)
const amountBC = payAmt.mul(convRate);

// ❌ server action C (same formula, slightly different rounding)
const bcAmount = amt.mul(r).toDecimalPlaces(4);
```

**What goes wrong:** Formula is correct today, but if rounding rules change (e.g., 2dp for display but 4dp for storage), you must find and update 15+ call sites. One gets missed → silent rounding drift.

### RIGHT — One function, called everywhere

```ts
// ✅ All callers
import { calculateAmount } from "@/lib/currency/conversion";
const businessAmt = calculateAmount(debitAmountAC, rateDebit);
```

**If the formula changes, it changes in one place.**

### Inventory/FIFO Gatekeeper Facts

- Inventory batch cost truth comes from `computeInventoryBalance()`: sum all debit-side inventory costs for the batch, including cost-only debit additions, and divide by positive purchased quantity for per-unit cost.
- FIFO sale preview and FIFO sale posting must share `src/lib/batch/fifo-consume.ts`; callers must not create a separate preview algorithm that can drift from actual posting.
- User-facing FIFO rows must show `Batch.batchNumber`. Internal `batchId` is for joins, keys, and traceability, not for business review labels.

### Buy-Side Correction Gatekeeper Facts

- Buy-side correction pages are thin orchestrators under `/tools/buy-side-corrections`; all correction rules live in `src/lib/buy-side/corrections.ts`.
- PO source replacement is allowed only when the correction preview has no blockers. If a GRN already exists for the PO, the source replacement path blocks because GRN valuation has already consumed the linked cost rows.
- Late supplier costs for unreceived stock are not ordinary PO misc costs. They are `PurchaseOrderScopedCost` rows and are consumed only by future GRNs.
- Shipment cost replacement is allowed only before allocation/landed-cost absorption and before shipment close.
- Every correction that changes a linked JE must create a `BuySideCorrection` audit row with old/new snapshots and JE IDs.

### Purchase Entry Gatekeeper Facts

- `gkCreatePurchaseEntry` (in `src/lib/mutations/purchase-entry.ts`) is the **single shared gatekeeper** for creating purchase entries. Both the GUI server action (`src/app/(dashboard)/journal/purchase/actions.ts`) and the MCP handler `purchase.create_entry` (`src/lib/mcp/tools/purchase-entry.ts`) call it inside a Prisma transaction. No caller may create a DRAFT batch inline — the gatekeeper is the only writer.
- The gatekeeper enforces the **inventory-only** rule: the debit (inventory) account must have subtype `Inventory` (`SUBTYPE.INVENTORY`) and must NOT be a clearing account. Otherwise it throws with a message containing "must have subtype", which `mapGatekeeperError` maps to `VALIDATION_ERROR`. Operating-expense / clearing account IDs are rejected.
- Initial-entry rules: QTY is required and `batchNumber` is required; `tx.batch.create` produces a DRAFT batch owned by the supplied inventory account.
- Additional-cost rules: QTY is forbidden; the target batch must exist for this company/inventory account and must still be DRAFT.
- JE creation delegates to `createJournalEntry` (single credit line) or `createCompoundJournalEntry` (multi-line compound). Per-unit cost is recalculated by `recalculatePerUnitCost` after creation.
- The previous GUI-only `loadPurchaseAccounts` dropdown filter is not the gatekeeper — it is a UX optimization. The gatekeeper is the authoritative check; downstream callers cannot bypass it.

### Purchase Entry Batch Repair Gatekeeper Facts

- `commitPurchaseEntryBatchRepair` (in `src/lib/inventory/purchase-entry-batch-repair.ts`) is the **only** audited workflow that deletes a malformed empty DRAFT batch that was attached to a non-inventory account. It is exposed via the admin-only "Purchase Entry Batch" tab under `/tools/buy-side-corrections` (gated by `canUseProductReclass`) and is **not** a generic batch delete.
- Preview checks (all must pass before commit can run):
  - Batch status is `DRAFT`.
  - Batch's account subtype is **NOT** `Inventory` (this repair is only for malformed non-inventory batches; properly typed batches use ordinary correction paths).
  - Journal entry is still linked to the batch (`journalEntry.batchId === input.batchId`).
  - Journal entry has **no** PO, shipment, or GRN domain links.
  - All 22 dependency counts are zero (other JEs, GRN lines, movements, carton lots, PO payments, inspections, misc costs, freight costs, customs clearances, purchase invoices, supplier payments, reconciliation entries, allocation links, forwarder payments, 3PL invoices, 3PL invoice lines, 3PL payments, operational settlements, settlement entries, Amazon claims, FBA reimbursement claims, purchase-order scoped costs).
  - Reason text is non-empty.
- Commit (in one Prisma transaction):
  1. Sets `journalEntry.batchId/qty/perUnitCost` to `null` (preserves the JE's amounts, accounts, date, description, and attachments).
  2. Deletes the DRAFT batch.
  3. Writes a `BuySideCorrection` audit row with `correctionType: "GRN"`, `sourceType: "MALFORMED_PURCHASE_ENTRY_BATCH_REPAIR"` (string constant — no Prisma enum migration), `originalJournalEntryId = correctedJournalEntryId`, and old/new snapshots via `toAuditJson`.
- Race-safety: `updateMany({ where: { id, batchId } })` and `deleteMany({ where: { id, status: "DRAFT" } })` both check `count === 1` and throw if the row changed after preview.

---

## Linkage and dates

New and modified mutations, pages, repair tools, imports and restore adapters must follow [Linkage and business dates](linkage-and-dates.md). This includes related child references when a product changes and selected-date receipt eligibility before stock is consumed. UI validation alone is insufficient.

## Universal Rules (All Three Domains)

### 1. One Gatekeeper Per Concern
Each bounded context has exactly **one** gateway. All usage flows through it.

### 2. Validation Lives in the Gatekeeper, Not the Caller
Callers may do early-exit validation (UX optimization), but the gatekeeper is the **authoritative** check.

### 3. Never Reach Around the Gatekeeper
No server action, seed script, import tool, or new page may bypass the gatekeeper.

### 4. Gatekeepers Are Composable
A shipment gatekeeper may call the journal gatekeeper internally. The journal gatekeeper still runs its own validation.

### 5. Fail Loud, Fail Early
Gatekeepers **throw** on invariant violation. They never silently fix bad data, log-and-continue, or return a "warning". The transaction rolls back.

### WRONG — Gatekeeper silently fixes bad data

```ts
export async function createJournalEntry(tx, input) {
  if (input.conversionRateDebit === "0") {
    input.conversionRateDebit = "1";  // ❌ Silent fix — hides upstream bug
  }
}
```

### RIGHT — Gatekeeper throws, caller must fix

```ts
export async function createJournalEntry(tx, input) {
  const rate = new Decimal(input.conversionRateDebit);
  if (rate.isZero()) {
    throw new Error("Conversion rate cannot be zero");  // ✅ Upstream bug caught immediately
  }
}
```

### 6. Domain FK Tagging for JournalEntry Traceability

When a gatekeeper creates or modifies a journal entry, it must tag the entry with the originating domain entity's ID:

```ts
// In purchase-order gatekeeper
const je = await createJournalEntry(tx, {
  debitAccountId: ...,
  creditAccountId: ...,
  amount: ...,
  purchaseOrderId: poId,  // ← Tag the JE with the PO
});

// In shipment gatekeeper
const je = await createJournalEntry(tx, {
  debitAccountId: ...,
  creditAccountId: ...,
  amount: ...,
  shipmentId: shipmentId,  // ← Tag the JE with the Shipment
});

// In GRN gatekeeper
const je = await createJournalEntry(tx, {
  debitAccountId: ...,
  creditAccountId: ...,
  amount: ...,
  purchaseOrderId: poId,
  shipmentId: shipmentId,
  goodsReceiptId: grnId,  // ← Tag with all three if applicable
});
```

**Rules:**
- Every JE created by a domain mutation must include at least one FK to its originating entity
- `purchaseOrderId`, `shipmentId`, `goodsReceiptId` are all optional and nullable
- Tag all applicable domain entities (GRN JEs typically have all three FKs)
- The UI displays these as "Part of: PO XXX, Shipment YYY, GRN ZZZ" with clickable links
- Backup FK remapping is automatic via `remapFks` in the journal-entries source

### 7. Approval Routing (requireWriteGate + submitForApprovalIfNeeded)
When a page has `requiresApproval=true`, the server action uses `requireWriteGate` and short-circuits:
```ts
export async function createEntity(formData: FormData) {
  const { user, company } = await requireCompany();
  const gate = await requireWriteGate(user.id, company.id, "page-key");

  if (gate.needsApproval) {
    const payload = { /* serialize form data */ };
    await submitForApprovalIfNeeded(gate, "EntityType", "page-key", payload);
    redirect("/my-requests");
  }

  // Normal path: create entity directly
  const entity = await gkCreateEntity(tx, { ... });
}
```
Key points:
- When `needsApproval=true`: serialize payload as JSON, store in PendingApproval. Do NOT create the real entity.
- When `needsApproval=false`: create entity normally via gatekeeper
- On approval: handler.execute() deserializes payload -> calls gatekeeper -> real entity created
- On rejection: PendingApproval marked REJECTED, nothing to clean up (no entity exists)
- SUPER_ADMIN always gets `needsApproval=false`

### 8. New Feature Checklist
When building anything new:
1. **Data write?** → Does a mutation gatekeeper exist for this domain? Use it. No? Create one first.
2. **UI input?** → Does a canonical component exist? Use it. No? Create one, register it.
3. **Calculation?** → Does a shared function exist? Use it. No? Extract one from existing inline code.
4. **Adding an invariant?** → Add to gatekeeper, not to individual callers.
5. **Seed/import script?** → Must use the same gatekeepers as the UI.
6. **Page with approval?** → Use `requireWriteGate()` + `submitForApprovalIfNeeded()` to check approval and serialize payload when needed.
7. **Creating a JournalEntry?** → Tag it with domain FK(s) — `purchaseOrderId`, `shipmentId`, `goodsReceiptId` — so JEs are traceable to their originating entity.

## Anti-Patterns (Never Do These)

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Validation in server action only | Seeds, imports, other actions bypass it | Move to gatekeeper |
| Direct `prisma.create()` for a gatekept domain | Bypasses invariant checks | Call the mutation gatekeeper |
| Copy-pasting validation into multiple callers | One copy gets stale, bugs diverge | Single source in gatekeeper |
| Gatekeeper silently corrects bad input | Hides upstream bugs | Throw, let caller fix |
| "Temporary" direct DB write | Becomes permanent | Use the gatekeeper from day one |
| Inline `.mul(rate)` instead of `calculateAmount()` | Rounding/formula changes need N updates | Call the shared function |
| Custom account picker on one page | Inconsistent UX, duplicated display logic | Use `<AccountSelect>` |
| `<Input>` for conversion rate | No auto-fetch, no timestamp, no validation | Use `<CurrencyConversion>` |

## Identifying Gatekeepers

A gatekeeper exists wherever **a behavior must be consistent across all usage points**:
- Journal entries → balance equation must balance
- Inventory movements → stock cannot go negative
- PO status transitions → must follow valid state machine
- Account creation → must have valid type, unique code per company
- Payments → cannot exceed outstanding balance
- Currency math → rounding and formula must be identical everywhere
- Account display → `#id Name [Currency]` format everywhere
- Table filtering → same UX pattern on every table
