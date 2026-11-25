# CLAUDE.md

This file provides guidance to Claude Code when working in this app.

Read `~/coding/OUTPUT_STYLE.md` and follow it for all replies and progress updates.

## What this is

Consologist TMS (Task Management System) — Next.js App Router + React + Prisma/Postgres, built on the portable
modules and rules copied from `~/coding/accountant`. It reproduces the captured Freedcamp behavior. The reference capture and reconstruction scope live at
`/home/mahrukh/rea-analysis/freedcamp/FREEDCAMP-REVERSE-ENGINEERING.md` and
`/home/mahrukh/rea-analysis/freedcamp/RECONSTRUCTION-SCOPE.md` (reference-only; not part of the app).

## Domain-flow documentation (read before planning, implementing, reviewing or testing)

- `DOMAIN_FLOW.md` — requirements, boundaries, pages, entities, handoffs, terminal outcomes.
- `docs/domain/INDEX.md` — canonical reading lane and file ownership.
- `docs/domain/UTILITY_TRACEABILITY.md` — full inventory, purposes, consumers, branches, edge cases, evidence.
- `docs/domain/ENTITY_LIFECYCLES.md`, `API_TO_GUI_MAP.md`, `PAGE_CONNECTIONS.md`, `OPEN_GAPS.md`.

Keep required, proposed, accepted-design, statically traced, runtime-verified and unresolved statuses distinct.
A structural checker pass is not behavioral proof. Update the affected docs in the same change as any
route, action, tool, gatekeeper, lifecycle, permission or backup-source change.

## Commands

```bash
export PATH="$HOME/.local/opt/node-v24.22.1-linux-x64/bin:$PATH"
npm install
npx prisma generate
npm run dev          # Next dev server
npm run build        # production build
npm run lint
npm run typecheck        # scoped + bounded; see .claude/rules/typecheck.md
npm run mcp          # stdio MCP subprocess (needs MCP_API_KEY, MCP_COMPANY_ID)
```

Database:

```bash
npm run db:push      # push schema (development stage — no migrations yet)
npm run db:migrate   # only after the project is finalized
```

Docker (development stage; the stack pushes the schema, no migrations):

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up -d --build
```

See `DOCKER-DEPLOYMENT.md` and `.claude/rules/deployment.md`. The stack runs postgres, a one-shot
`migrate` service, the app on host port 3200, and HTTP cron containers. Health: `/api/health`.
MCP over HTTP: `/api/mcp` (stdio is not shipped in the runtime image).

## Mandatory rules

Read `RULES.md` and the matching `.claude/rules/*.md` before touching that area.
The non-negotiables:

- Gatekeeper architecture: one mutation gateway per domain; GUI and MCP both call it.
- GUI rules: canonical shared components, `notify` feedback, nav from `nav-sections.ts`, scannable views with details-on-demand (`gui-design.md`).
- MCP parity: shared query filters, presenters and gatekeepers; no duplicated validation.
- Auth/RBAC: client/server barrel boundary; `requireWriteGate` for creates.
- Data safety: bounded pipelines, audited deletes, identity/date validation.

## UI system

Vibrant & Block-based: tokens in `src/app/globals.css`, Lexend Mega headings + Public Sans body.
Shared controls: `AssigneePicker`, `DateTimePicker`, `TagInput`, `BlockSelect`, `SearchableSelect`,
`NotifyForm`. Use the shared components; do not reintroduce native dropdowns or bare date inputs.

## Architecture

```
src/modules/auth-session   Portable JWT sessions, email tokens, invites
src/modules/auth-rbac      Portable page registry, templates, overrides, approval gates
src/modules/google-drive   Portable Drive auth, connection, upload, sharing
src/modules/mcp            Portable MCP server: registry, dispatch, stdio/HTTP transports
src/modules/backup         Portable encrypted backup/restore, data-source registry, storage
src/modules/auth-session/email  Portable Resend email (reset, invite, welcome, approvals)
src/lib/backup             App bridge: registers company-scoped backup sources
src/lib/auth               App bridge: session -> user, page definitions, permission matrix
src/lib/company            Active workspace resolution, starter workspace seeding
src/lib/mutations          Domain gatekeepers (the only DB writers)
src/lib/tasks              Task schema, shared WHERE builder and presenter
src/lib/mcp                App bridge: callbacks, tool registration, tools/{domain}
src/app/(auth)             Login, register
src/app/(dashboard)        Workspace shell, tasks, account, admin, placeholders
prisma/schema.prisma       Foundation + Freedcamp domain model
src/lib/notifications/email-alerts.ts  Assignee-only email alerts + dedupe
scripts/send-due-alerts.ts             Cron entry for due/overdue alerts
```

Key boundaries:

- `@/modules/auth-rbac/client` and `@/modules/auth-session/client` are the only safe
  imports for `"use client"` files. Root barrels pull in Prisma/pg.
- `src/modules/mcp/**` must never import `@/lib`, `@/app`, `@/components`, or `next/*`.
  Tool handlers live in `src/lib/mcp/tools/`.
- `Company` = Freedcamp workspace. Groups → projects → apps → items.
- Files use Google Drive (`CompanyGoogleDrive`), not S3.
- `mcpWritesEnabled` defaults to false; the MCP write toggle applies to SUPER_ADMIN too.

## MCP parity

Every business GUI function has an MCP tool that calls the same shared gatekeeper/service.
The exceptions are intentionally GUI-only: login/register/password reset, workspace creation,
and MCP API-key creation/revocation (an agent must not mint its own credentials).

## UI themes and task views

- Default theme: **Flat Design** (`data-theme="flat"`).
- Optional **Vibrant & Block-based** theme via the top-right Flat/Block toggle; persisted in `localStorage`.
- Tasks support list, board, table and Eisenhower-matrix views (`/tasks?view=…`), task-list creation, rename, archive and delete.
- Subtasks (`Task.parentId`), parent reassignment, list moves, drag-and-drop in the list view (drop on a list header = move list, drop on a task = make subtask), bulk archive/unarchive/move/delete, task archive (`Task.archivedAt`), archived tasks and archived task lists at `/tasks?archived=1`.
- Filters can be saved by name (`SavedSearch`, appKey `tasks`) and reapplied from the Filters panel.
- Eisenhower quadrant (`Task.quadrant`: DO_FIRST / SCHEDULE / DELEGATE / ELIMINATE) is a nullable classification independent of workflow status; editable inline in every view, filterable, and shown in the matrix view.
- The list view groups tasks under their task list (project + list heading, per-list counts, empty lists included).
- Table view has a persisted column picker; search and filters (project/list/status/priority/quadrant/assignee/due) carry across views.

## TypeScript checks

Use `npm run typecheck` (scoped `tsconfig.typecheck.json`, incremental, 4 GiB heap, 240 s timeout). Avoid bare `tsc --noEmit`; it scans `.next` and generated Prisma output. See `.claude/rules/typecheck.md`.

## Personal edition

No plan tiers, no feature gating, no billing. Every implemented feature is available to every workspace member; access is controlled only by RBAC.

## Documents and markdown

- `ProjectDocument` + `DocumentAttachment`; page `/documents`.
- Drawer: MDXEditor with Formatted/Markdown toggle, multi-level outline with per-heading and all-level collapse/expand, voice-note recording, attachments.
- Gatekeeper: `src/lib/mutations/documents.ts`; MCP: `documents.*`.
- Long description fields use `MarkdownField` / `MarkdownView`.

## Runtime evidence

See `docs/domain/RUNTIME_VERIFICATION.md` (Postgres, browser, MCP stdio, cron, Resend).
Google Drive OAuth is blocked until the callback URI is registered.

## Current slice

Implemented: auth (login/register/session, Google sign-in, forgot/reset password, invitations/accept),
email module (Resend), workspace shell + RBAC guards,
backup module (create/preview/restore/delete, DB + filesystem + Drive adapter),
tasks (statuses, multiple assignees, create-on-the-go tags, comments) with one gatekeeper,
MCP tools (shared gatekeepers): `tasks.list` / `tasks.create` / `tasks.update_status` / `tasks.comment`,
`backups.list` / `backups.create` / `backups.preview_restore` / `backups.restore` / `backups.delete`,
`users.list` / `users.invite` / `users.revoke_invitation`,
`account.get_alert_prefs` / `account.update_alert_prefs`,
email alerts (due soon, overdue, comment, mention) for assignees + due-alert cron,
account page with MCP API keys and write toggle.

Next slices follow `../RECONSTRUCTION-SCOPE.md`: discussions, files (Drive), calendar,
time, settings/admin, search/filters, table view and documents.
