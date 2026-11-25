---
description: "Frontend rules: mobile-first responsive, shadcn/ui, FilterableHead tables, financial grid alignment, account numbers"
alwaysApply: false
---

# Frontend Rules

## Reusable Classes — Check First
Before writing any component, hook, or utility: run `/reusable-classes search {keyword}`.
If a match exists → import it. If partial → extend it. Only create new if no match.
After creating a reusable piece: run `/reusable-classes register` to add it to the registry.

## Mobile-First Responsive
- Tables: wrap in `overflow-x-auto` with `min-w-[Xpx]` on the table element
- Grids: start `grid-cols-1`, add `md:grid-cols-N` for larger breakpoints
- Flex rows: `flex-wrap` or `flex-col sm:flex-row`
- Page padding: `p-4 sm:p-6` (not flat `p-6`)
- Sidebar hidden on mobile (`hidden lg:block`); use MobileNav drawer at `src/components/dashboard/mobile-nav.tsx`
- Header text: hide on xs with `hidden sm:block`
- Never fixed pixel widths without `overflow-x-auto` parent

## FilterableHead (ALL tables)
Component: `src/components/ui/filterable-head.tsx`
Hook: `src/hooks/use-filterable-table.ts` ← **always use this, never duplicate state manually**

Every table must use the shared hook:
```tsx
const { fh, filtered, sorted, hasFilters, clearAllFilters } = useFilterableTable(rows, filterFn)
```

Never copy-paste the 4 useState blocks into a table component. If the hook doesn't exist yet, create it first, register it via `/reusable-classes register`, then use it.

Pattern: hover reveals filter icon, click morphs header into auto-focused input, ESC clears, blur saves, active filter shows dot + clear button.

Show match counter + "Clear all filters" above table when any filter active. For paginated tables add "(this page)". Filter against the same string shown in UI.

Every column can be filtered — but filters live inline in each header cell (click to morph), never as a separate `<tr>` filter row in `<TableHeader>`.

## Financial Table Alignment
Shared CSS grid constant for ALL rows (headers, data, totals, special rows):
```ts
const COLS = "grid-cols-[5.5rem_1fr_6.5rem]";
```
Never use `flex justify-between` for financial rows — amounts drift per row.

## Shipment Transport Mode — Always ShipmentModeBadge

Transport mode is a shared enum with more than two values: `BY_SEA`, `BY_AIR`, `BY_TRUCK`, `BY_ROAD`, `BY_RAIL`, `CUSTOM`.

- **Never** write `mode === "BY_SEA" ? "Sea" : "Air"` at a call site. That ternary renders every non-sea value (truck, road, rail, custom) as "Air". Use `<ShipmentModeBadge mode={mode} modeNote={modeNote} />` from `@/lib/shipments/shipment-mode-badge`.
- For plain text (filters, tooltips, approval previews), use `getShipmentModeShortLabel` / `getShipmentModeDisplay` / `getShipmentModeLabel` from `@/lib/shipments/shipment-mode`.
- For `<Select>` / `<SearchableSelect>` options, use `SHIPMENT_MODE_OPTIONS` — never hand-write the value list, or new modes will not appear in the form.
- Mode options are **display + reporting only**. No gatekeeper business rule branches on `mode`; adding a value cannot affect an accounting or inventory invariant.
- `CUSTOM` requires a free-text `modeNote` (max 200 chars). The invariant is enforced in the gatekeeper via `assertCustomModeHasNote`, not in the form.
- Adding a mode value = edit `SHIPMENT_MODES` in `src/lib/shipments/shipment-mode.ts`, add the Prisma enum value in a migration, and add its label/short-label/tone/icon entries. No other call site changes.

## Currency Selection — Always CurrencySelect
- **Never** use a plain `<Input>` for currency codes. Always use `<CurrencySelect>` from `@/components/ui/currency-select`.
- Fetch active currencies server-side: `prisma.currency.findMany({ where: { companyId, isActive: true }, select: { code: true } })` → pass `codes.map(c => c.code)` as `currencies` prop to client.
- Use `noClear` only when the field is required and can never be blank. All other uses allow the × clear button.

## Account Pickers — Always AccountSelect
- **Never** use `AccountCombobox`, bare `SearchableSelect`, or inline wrappers for account selection.
- Always use `<AccountSelect>` from `@/components/ui/account-select`.
- The component displays `#id Name / SubAccount [Currency]` with type-based chip filtering.
- Server queries must include `accountType: { select: { name: true } }` and `accountSubtype: { select: { name: true } }` for the `AccountForSelect` shape.

## Dropdowns & Selects — Always SearchableSelect
- **Never** use bare shadcn `<Select>` for optional fields or account pickers. Use `<SearchableSelect>` from `@/components/ui/searchable-select` — it has a built-in × clear button and scroll-safe dropdown.
- **Default behaviour is to show the × clear button.** Do NOT add `noClear` unless the field is truly required and an empty value would be invalid with no way to recover (e.g. PO selection when creating a new item where the field cannot be blank).
- When in doubt, omit `noClear` — clearing and re-selecting is always safer for the user than being locked in.
- Account pickers, status selects, type selects, payment type selects, event type selects — all must be `SearchableSelect` **without** `noClear`.

### SearchableSelect Portal Behavior
The dropdown portal renders to `document.body` via `createPortal()` to escape `overflow: hidden` clipping in parent containers (e.g. tables with `overflow-x-auto`):
- Dropdown calculates position relative to the input element
- Click-outside detection includes both the portaled dropdown and the input container via `dropdownRef`
- Position updates on scroll/resize to keep dropdown aligned
- This fixes the "dropdown hidden behind table" problem without changing parent overflow styles

### SearchableSelect Inside Radix Dialog (CRITICAL)
Radix Dialog's `DismissableLayer` sets `document.body.style.pointerEvents = "none"` when the dialog is modal, and only gives `pointer-events: auto` to the dialog content element. Portaled dropdowns (children of body) inherit `pointer-events: none` and become unclickable — options display correctly but clicks are silently ignored.

**Fix (already applied):** The portaled dropdown container has `pointerEvents: "auto"` in its inline style, overriding the inherited `none` from body. This is set in `SearchableSelect` globally so it works in all dialog contexts.

**If adding a new portaled component inside a Dialog:** Always include `pointerEvents: "auto"` on the portal container's style. Do NOT rely on `onPointerDownOutside` alone — that prevents dialog dismiss but doesn't fix the CSS inheritance.

## Conversion Rates — CurrencyConversion is the Gatekeeper

`<CurrencyConversion>` from `@/components/currency-conversion` is the **single canonical gatekeeper** for all currency rate inputs. Every form that involves a rate must use it. No exceptions.

**Rules:**
- **Never** use a plain `<Input>` for a conversion rate — this bypasses the gatekeeper
- **Never** add a manual currency selector to drive rates — currencies must come from the **selected account object** (`account.accountCurrency`)
- Show TWO independent boxes per entry (one per leg that differs from business currency):
  1. Debit box: `fromCurrency={debitAccountCurrency}` `toCurrency={businessCurrency}` — render only when `debitAccountCurrency && debitAccountCurrency !== businessCurrency`
  2. Credit box: `fromCurrency={businessCurrency}` `toCurrency={creditAccountCurrency}` — render only when `creditAccountCurrency && creditAccountCurrency !== businessCurrency`
- Place account pickers **before** conversion boxes — currencies can't be derived until an account is selected
- Use `onLoadingChange` + a loading counter in the parent to disable the submit button while rates are fetching
- On fetch error, the component calls `onRateChange("")` — treat an empty rate as invalid and block submission
- Use `allowManualOverride` on all payment forms so users can correct stale rates

**Rate direction (enforced by journal gatekeeper):**
- Debit rate: `debitAccountCurrency → businessCurrency` (e.g. `from=USD to=GBP` → 0.74)
- Credit rate: `businessCurrency → creditAccountCurrency` (e.g. `from=GBP to=USD` → 1.35)
- Same-currency account must use rate = 1 (journal gatekeeper rejects any other value)

Reference: `src/components/currency-conversion.tsx`, `src/app/(dashboard)/purchase-orders/[id]/po-detail-client.tsx`

## Inventory Amount Display — Account Currency First

Any amount that lives in an inventory account (COGS, estimated COGS, per-unit cost, batch value, landed cost) **must be shown in the inventory account currency as the primary value**. The business currency is shown below it, smaller, as a reference only.

```tsx
// When inventoryAccountCurrency !== businessCurrency:
<span className="flex flex-col leading-tight gap-0.5">
  <span>{amountAc} {inventoryAccountCurrency} ({perUnitAc}/unit)</span>
  <span className="text-xs text-muted-foreground">{amountBc} {businessCurrency} ({perUnitBc}/unit)</span>
</span>

// When same currency — single line only:
<span>{amountBc} {businessCurrency} ({perUnitBc}/unit)</span>
```

**How to get the AC amount:**
- For detail pages: call `previewFifoBatches()` server-side when `inventoryAccount.accountCurrency !== businessCurrency` — gives `perUnitCostAcTotal` and `inventoryAccountCurrency`.
- For FIFO preview tables: use `line.perUnitCostAc` and `line.inventoryAccountCurrency` already in `FifoBatchPreviewLine`.
- Never derive AC from `conversionRateCreditInventory` alone — that is only set post-posting.

This rule applies everywhere inventory amounts appear: order detail pages, FIFO preview tables, batch lists, reports, summaries.

## General
- shadcn/ui controls only (never raw HTML inputs)
- Account # alongside name in combos, labels, buttons — everywhere
- Journal entry refs: always clickable links (e.g. #92938431)
- Every combo/dropdown: searchable with clear button
- `<Badge>` renders a `<div>`. Never wrap in `<p>`. Use `<span>` or `<div>`.
- Tools crossing multiple accounts: dedicated page under "Tools & Utilities" sidebar section

## Action feedback — shared bottom-right notices

Follow `.claude/rules/notifications.md` for all new or modified action flows. Import `notify` from `@/lib/notifications/client`; errors must not be hidden only at the top of a long page. One root `Toaster` serves the entire app. Report success only after the server confirms it, and label unsaved form additions as informational.
