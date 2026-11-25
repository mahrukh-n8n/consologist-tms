# Project Rules — Consologist TMS

Mandatory rules live in `.claude/rules/`. Read the matching file before changing that area.

| Rule | Area | Mandatory when |
|---|---|---|
| [auth-rbac](.claude/rules/auth-rbac.md) | Page permissions, templates, approval gates | Any page, server action, permission check |
| [auth-session](.claude/rules/auth-session.md) | JWT sessions, invites, OAuth, returnTo chain | Auth, invitations, password flows |
| [gatekeeper](.claude/rules/gatekeeper.md) | Single mutation/UI/calculation gateway | Any write, input component, shared formula |
| [frontend](.claude/rules/frontend.md) | Shared UI, responsive, canonical inputs | Any component or page |
| [gui-design](.claude/rules/gui-design.md) | Scannable layout, details-on-demand, review before redesign | Any new or redesigned view |
| [navigation](.claude/rules/navigation.md) | Single nav source, sections, role gating | Any new page or nav item |
| [notifications](.claude/rules/notifications.md) | `notify` bottom-right feedback | Any user-triggered async action |
| [mcp-module](.claude/rules/mcp-module.md) | Portable MCP, parity law, transports | Any MCP tool or gatekeeper |
| [pre-build-framework](.claude/rules/pre-build-framework.md) | 7-phase design validation | Any non-trivial UI+backend feature |
| [domain-lifecycles](.claude/rules/domain-lifecycles.md) | State machines and invariants | Any entity lifecycle or write |
| [bounded-data-processing](.claude/rules/bounded-data-processing.md) | Bounded memory for growing data | Uploads, imports, exports, bulk jobs |
| [deletion-audit](.claude/rules/deletion-audit.md) | Audited deletion snapshots | Any business-record delete |
| [linkage-and-dates](.claude/rules/linkage-and-dates.md) | Identity and business-date validation | Links, dates, restores, repairs |
| [backup-module](.claude/rules/backup-module.md) | Portable backup/restore sources and integrity | Backup, restore or new company-scoped model |
| [typecheck](.claude/rules/typecheck.md) | Bounded/scoped TypeScript checks | Before claiming type safety or when `tsc` hangs |
| [documentation](.claude/rules/documentation.md) | User docs for every feature | After completing a feature |
