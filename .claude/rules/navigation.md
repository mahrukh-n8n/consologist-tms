# Navigation & Sidebar Rules

## Canonical Source
Sidebar navigation data lives in ONE file: `src/lib/nav/nav-sections.ts`. Desktop (`src/components/dashboard/sidebar.tsx`) and mobile (`src/components/dashboard/mobile-nav.tsx`) render from that shared data. No page may create its own navigation. All nav changes go through `nav-sections.ts`.

## Structure — Grouped by Workflow

Sections are ordered by the user's operational workflow, not alphabetically or by creation date.

```
[Search bar — fuzzy filters nav items as you type]

DASHBOARD
  Home / Overview
  My Approval Requests

PROCUREMENT (buy-side flow order)
  Purchase Orders
  Suppliers
  Products
  Forwarders

LOGISTICS
  Shipments
  Goods Receipts
  3PL Warehouses
  FBA Centers
  Box Configs

OPERATIONS
  Dashboard (widget hub)
  Order Overview
  Where is my Inventory?
  Stock Summary

AMAZON FBA
  FBA Plans
  Prep Requirements
  Removal Orders
  Claims
  Reconciliation
  Discrepancy Report
  Loss Report

ACCOUNTING
  Accounts
  Journal
  Ledger
  Inventory (batches)
  Reports (sub-menu)

TOOLS
  FX Settlement
  Shared Cost Allocation
  Buy-Side Corrections
  Amazon Pipeline
  Amazon Pipeline Settings
  Year-End Close

SETTINGS (bottom-pinned, collapsible)
  Company Settings, Currencies, Fiscal Years, Account Types/Subtypes,
  Addresses, Rules, Notifications, Import

ADMIN (bottom-pinned, role-gated)
  Approval Queue, Users, Permission Templates, Invitations, Audit Log, Write Audit Log, Permission Audit, Permission Gap Report, Backups
```

## Rules

### 1. Every Nav Item Has an Icon
Use Lucide icons (already in project). No text-only nav items. Icon + label on desktop, icon-only in compact mode.

### 2. Every New Page Gets a Nav Entry
When adding a page, add it to the correct section in the sidebar. No orphan pages accessible only by URL or internal links.

### 3. Section Order is Fixed
Do not reorder sections. New items go into the appropriate existing section. New sections require discussion.

### 4. Active State is Visible
Current page highlighted with accent bar/indicator. Parent section auto-expanded when a child is active.

### 5. Search Filters Everything
The search bar at the top fuzzy-matches against all nav item labels. No section is excluded from search.

### 6. Mobile Parity
Mobile drawer (`mobile-nav.tsx`) must have the same sections, same order, same items as desktop sidebar. No "desktop-only" nav items. Bottom tab bar shows top 4-5 most-used items for quick access.

### 7. Role-Gating
Admin section only visible to admin users. Settings visible to all authenticated users. All other sections visible to all roles (page-level permission checks handle access).

### 8. Compact Mode
Toggle between full sidebar (icon + label) and compact sidebar (icon only). User preference persisted. Hover on compact mode shows tooltip with label.

### 9. No Deep Nesting
Maximum 2 levels: Section → Item. No sub-sub-menus. If a section has too many items (>10), split into two sections.

### 10. Consistent Naming
Nav labels match page titles exactly. If the page title is "Purchase Orders", the nav label is "Purchase Orders" — not "POs" or "Orders".
