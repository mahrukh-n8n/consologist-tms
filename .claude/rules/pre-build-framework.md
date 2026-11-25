# Pre-Build Design Framework

A 7-phase process for validating features before writing code. Absorbs the "No Loose Ends" 8-question checklist — projects using this framework do not need a separate NLE review.

## Triggers

**FULL (all 7 phases):** Non-trivial UI+backend features — dialogs, forms, multi-step flows.
Skip only for single-file bug fixes, pure refactors, or trivial changes.

**PHASE 5 ONLY:** Any feature that creates, moves, or links records — even pure backend with no new UI.
If the feature touches entity lifecycles or state machines, Phase 5 must run.

## Scope

One brainstorm per feature. Never combine multiple features into one brainstorm.
Sub-dialogs share the parent brainstorm only if opened from the same page and sharing state.

---

## Phase 1: Input-Output Contract (10 min)

**Goal:** Every backend parameter has exactly one UI source. Every UI control maps to exactly one backend field.

```
BACKEND NEEDS (params)         UI PROVIDES (controls)        REQUIRED?
─────────────────────          ──────────────────────         ─────────
orderId: number           ←    route param                    YES
paymentMethod: enum       ←    RadioGroup (3 options)         YES
couponCode: string        ←    Input (text)                   NO
preparedIds?: number[]    ←    ???  ← NO UI CONTROL           REMOVE
```

**Rules:**
- Every `←` must point to a concrete UI element
- Backend param with no UI source → remove the param or design the input
- UI control with no backend destination → remove the control
- Select with N options but only M supportable → restrict to M
- Mark optional vs required on both sides

**Absorbed NLE checks:**
- **NLE #4:** Every record created by this feature has a state from the moment it's created
- **NLE #6:** Every FK in the schema is either populated by this flow or removed from the design

---

## Phase 2: Cardinality Walk (5 min)

**Goal:** Explicitly handle 0, 1, and N for every list/collection in the feature.

```
COLLECTION: shipping addresses
  0 items → show "Add an address first" message, disable submit
  1 item  → auto-select, hide picker
  N items → full address picker dropdown
```

**Rules:**
- Every collection that drives UI must have all three cases documented
- "0" case = graceful message + disabled action (never silent empty state)
- "1" case = simplify UI where possible (hide unnecessary pickers)
- "N" case is the default — but never assume N is always the reality

---

## Phase 3: Text UI Mockup (15 min)

**Goal:** See the user-facing layout before writing component code. Catch missing labels, wrong options, layout issues.

```
STATE: Normal (N items)
┌─ Place Order ─────────────────────────────┐
│  Items (3)                                 │
│  ┌──────────┬─────┬──────────┐            │
│  │ Product  │ Qty │ Subtotal │            │
│  │ Widget A │  2  │ $40.00   │            │
│  └──────────┴─────┴──────────┘            │
│  Shipping: [Standard ▾]                   │
│  Total: $45.00 USD                         │
│                    [Cancel] [Place Order]  │
└────────────────────────────────────────────┘

STATE: Empty (0 items)
STATE: Single (1 item)
STATE: Success (after submission)
STATE: Error (validation failure)
```

**Rules:**
- Every number must have a currency code or unit label
- Every dropdown must list its actual options
- Separate mockup for: normal, empty, single-item, success, error states
- Conditional fields → note the condition

---

## Phase 4: User Journey Replay (15 min)

**Goal:** Walk through every realistic user path. Catch state leaks, double-execution, and dead-end screens.

**Mandatory journeys (always include):**
- **A:** Happy path
- **B:** Partial data / incomplete prerequisites
- **C:** User makes a mistake in input
- **D:** User does the same thing twice (idempotency)
- **E:** User switches modes/tabs mid-flow

```
JOURNEY A: Happy path — place order
1. User opens checkout → items load
2. Selects shipping → confirms → success
3. ??? Next action?
   → DECISION: offer "View Order" and "Continue Shopping"

JOURNEY D: Double-execution
1. User places order → success → closes
2. Returns to checkout with same items
3. Clicks "Place Order" again → ???
   → DECISION: detect duplicate, show warning
```

**State reset table (always include):**
```
State variable      │ Reset when?
────────────────────┼──────────────────────────────
selectedShipping    │ address changes
error               │ new submit attempt
successMsg          │ dialog reopens
```

**Absorbed NLE check:**
- **NLE #8:** If action A logically produces record B, B must be created in A's transaction. A user who must manually create B to keep the system consistent has found a bug.

---

## Phase 5: Invariant & Lifecycle Sweep (10 min)

**Goal:** Every mathematical/logical invariant is validated. Every entity lifecycle is respected.

### Step 1: Check project domain lifecycles

Look for the project companion file at `.claude/rules/domain-lifecycles.md`.
If this file doesn't exist and the project has entity state machines, create it.

### Step 2: Does the feature touch an existing lifecycle?

If yes, verify every transition this feature performs is in the state machine table.
If a transition is missing from the table, either add it or change the design.

### Step 3: New entity type?

Define its lifecycle (terminal states, transitions, balance equation) and add to `domain-lifecycles.md`.

### Step 4: Feature-specific invariants

```
INVARIANT                              │ CHECKED AT           │ BLOCKS
───────────────────────────────────────┼──────────────────────┼────────
sum(lineAmounts) = orderTotal          │ UI + gatekeeper      │ submit
quantity > 0                           │ UI + gatekeeper      │ submit
no duplicate order for same items      │ ??? NOT CHECKED      │ ← FIX
```

**Rules:**
- Every invariant must be checked at the gatekeeper level (authoritative)
- UI checks are optimization only — never the sole check
- `NOT CHECKED` = must be resolved before coding starts
- Precision must be consistent across preview, submission, and storage

**Absorbed NLE checks:**
- **NLE #1:** Can you name every terminal state for entities this feature creates?
- **NLE #2:** Balance equation holds — sum of all intermediate + terminal states = total created
- **NLE #3:** Every state transition is atomic — all side effects in one transaction

---

## Phase 6: Outcome Map (10 min)

**Goal:** Every user action has every possible outcome mapped. Nothing falls through.

```
ACTION: User clicks "Place Order"
OUTCOME                          │ HANDLER                │ STATUS
─────────────────────────────────┼────────────────────────┼────────
Server returns success           │ success msg + next     │ MAPPED
Server returns validation error  │ inline error, keep form│ MAPPED
Network timeout                  │ user can retry         │ DEFERRED
User double-clicks               │ disable on first click │ MAPPED
Data changed since dialog opened │ tx fails, show error   │ MAPPED
```

**Status values:**
- `MAPPED` — handler designed, will be coded
- `DEFERRED` — known gap, tracked with reason + risk level
- `MISSING` — **blocker** — cannot approve brainstorm

**Rules:**
- Every action gets an outcome table
- "User does this twice" is ALWAYS a row
- "Data changed since load" is ALWAYS a row
- No `MISSING` items when brainstorm is approved
- `DEFERRED` items tracked inside brainstorm file with risk level

**Deferred list:**
```
ID │ Outcome               │ Reason             │ Risk
───┼───────────────────────┼────────────────────┼──────
D1 │ Network timeout retry │ Low probability    │ LOW
D2 │ Concurrent edit guard │ V2 feature         │ MED
```

**Absorbed NLE checks:**
- **NLE #5:** One path per outcome — two code paths reaching the same state = one is a bug
- **NLE #7:** Every value-removal (deletion, cancellation, write-off) leaves a trace — no silent removals

**WRITE POINT 1:** After this phase, persist the brainstorm to disk. User reviews and approves before any code is written.

---

## Phase 7: Post-Code Verification (20 min)

**Goal:** Verify code matches the brainstorm. Catch new edge cases from actual code patterns.

### 7a. Contract Verification
Walk Phase 1 table, find the code for each row:
```
BACKEND PARAM    │ BRAINSTORM DECISION   │ CODE LOCATION     │ MATCH?
─────────────────┼───────────────────────┼───────────────────┼───────
orderId          │ route param           │ page.tsx line 12  │ ✓ / ✗
preparedIds      │ REMOVED               │ not in code       │ ✓ / ✗
```

### 7b. Outcome Map Verification
Walk Phase 6 MAPPED rows, find the handler code:
```
ACTION + OUTCOME                 │ CODE LOCATION           │ VERIFIED?
─────────────────────────────────┼─────────────────────────┼──────────
Submit → success → next action   │ handleSubmit line 67    │ ✓ / ✗
Double-click → disabled button   │ isSubmitting line 14    │ ✓ / ✗
```

### 7c. Cardinality Spot-Check
Find 0-case and 1-case code for each Phase 2 collection:
```
COLLECTION       │ 0-CASE CODE           │ 1-CASE CODE           │ OK?
─────────────────┼───────────────────────┼───────────────────────┼────
addresses        │ line 38 message       │ line 45 auto-select   │ ✓
payment methods  │ ??? missing           │ line 52 simplified    │ ✗
```

### 7d. New Edge Case Scan
Scan actual code for patterns that create new edge cases:
- **Async timing:** useEffect with missing deps? Race between load and submit?
- **Type coercion:** parseInt without isNaN? Number() on nullable?
- **State derivation:** useMemo on stale state? Derived value undefined?
- **Error boundaries:** await without try/catch in event handlers?

### 7e. Reconciliation Summary
```
PHASE 7 SUMMARY:
  Contract:    8 checked, 8 match      ✓
  Outcomes:    10 checked, 9 match     ✗ (1 fixed)
  Cardinality: 6 checked, 5 match     ✗ (1 fixed)
  New edges:   1 found → 1 fixed

  VERDICT: VERIFIED (all fixes applied)
```

**WRITE POINT 2:** Append Phase 7 results to brainstorm file. Update index status.

---

## Persistence

Brainstorms are persisted in `.planning/brainstorms/` (one file per feature).

**Naming:** `{NNN}-{feature-slug}-brainstorm.md`

**INDEX.md format:**
```
| # | Feature | Status | Date |
|---|---------|--------|------|
| 001 | Invoice payment dialog | VERIFIED | 2026-02-28 |
| 002 | Bulk status update | APPROVED | 2026-02-28 |
```

**Status values:** `APPROVED` (Phase 6 done) → `VERIFIED` / `NEEDS_FIX` (Phase 7 done)

**Two write points:**
1. After Phase 6 approval → create brainstorm file + INDEX row (Status = APPROVED)
2. After Phase 7 verification → append results to file + update INDEX (Status = VERIFIED/NEEDS_FIX)

---

## Process Summary

```
PRE-CODE (phases 1-6, ~65 min):
  1. Input-Output Contract     (in chat, iterative)
  2. Cardinality Walk          (in chat, iterative)
  3. Text UI Mockup            (in chat, iterative)
  4. User Journey Replay       (in chat, iterative)
  5. Invariant & Lifecycle     (in chat, iterative)
  6. Outcome Map               (in chat, then WRITE TO DISK)
  → User reviews on disk → approves → code begins

POST-CODE (phase 7, ~20 min):
  7. Post-Code Verification    (7a-7e checklist)
  → Append to brainstorm file → update INDEX → ship or fix
```

---

## Anti-Patterns

| Anti-Pattern | What happens | Instead |
|---|---|---|
| "I'll add that option later" | Ship an option that throws at runtime | Remove the option now, add when UI is ready |
| "Success → Close only" | Dead-end, must reopen for next action | Offer next logical action |
| "Works for N>1 items" | 0 or 1 items hits unexpected path | Cardinality walk catches this |
| "Brainstorm in chat only" | Decisions lost when session ends | Write to disk at Phase 6 |
| "DEFERRED = forgotten" | Gap never revisited | Track in brainstorm with risk level |
| "One file for everything" | Unreadable, can't track per-feature | One brainstorm per feature |
| "Validation only in UI" | Seeds, imports, APIs bypass it | Gatekeeper is authoritative check |
| "Skip Phase 5 — no state machine" | Entity reaches undefined state | Every created entity needs a lifecycle |
