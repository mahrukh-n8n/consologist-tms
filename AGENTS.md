# Repository Guidelines

Read `~/coding/OUTPUT_STYLE.md` and follow it for all replies and progress updates.

## Detailed rules

Read `CLAUDE.md` and `RULES.md`. The `.claude/rules/` files are mandatory.

Read `DOMAIN_FLOW.md` and `docs/domain/INDEX.md` first; use `docs/domain/UTILITY_TRACEABILITY.md` for the full inventory and edge cases, and `docs/domain/OPEN_GAPS.md` for unresolved scope. Update these docs with any route, action, tool, lifecycle or backup-source change.

## Non-negotiables

- **Gatekeeper architecture** (`.claude/rules/gatekeeper.md`): every mutation goes through one domain gatekeeper; UI and MCP call the same gatekeeper.
- **GUI rules** (`.claude/rules/frontend.md`, `gui-design.md`, `notifications.md`, `navigation.md`): shared UI components only, scannable layout with details-on-demand, `notify` for action feedback, nav from `src/lib/nav/nav-sections.ts`.
- **MCP parity** (`.claude/rules/mcp-module.md`): every GUI business rule, query filter and presenter is shared with MCP. No duplicated validation.
- **Auth/RBAC** (`.claude/rules/auth-rbac.md`, `auth-session.md`): portable modules, client/server barrel boundary, `requireWriteGate` for creates.
- **Data safety** (`bounded-data-processing.md`, `deletion-audit.md`, `linkage-and-dates.md`): bounded pipelines, audited deletes, identity/date validation at the mutation boundary.
- **Backups** (`backup-module.md`): every company-scoped model gets a data source with explicit `dependsOn` and FK remaps; validation runs in development.
- **TypeScript** (`.claude/rules/typecheck.md`): run `npm run typecheck`, never bare `tsc --noEmit` for routine checks; scope feature checks with a dedicated tsconfig.
- **Design first** (`pre-build-framework.md`, `domain-lifecycles.md`): validate a feature before code; every entity gets a lifecycle and every invariant is enforced at the gatekeeper.
