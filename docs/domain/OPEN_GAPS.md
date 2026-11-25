# Open Gaps, Risks, and Acceptance Impact — Consologist TMS

Last checked: 2026-11-19 (post-fix pass). Severity is acceptance impact, not effort. No gap is closed by a file existing.

## Resolved in the post-fix pass

| ID | Was | Now | Evidence |
|---|---|---|---|
| GAP-04 | MCP READ tools could write | `runReadOnlyTool` wired to `runMcpReadOnly` | `scripts/mcp-server.ts` |
| GAP-05 | Pending approvals had no executor | Approval queue + approve/reject + handler registry; execute on approve | `src/lib/approval/*`, `/manage-system/approvals` |
| GAP-06 | Alerts claimed before send; due scan capped | Send-then-mark, FAILED/retry with backoff, idempotent claim; due scan paginated | `src/lib/notifications/email-alerts.ts` |
| GAP-07 | 16/42 backup sources, no user remaps | 36 sources incl. users (passwords stripped), memberships, RBAC, chat, alerts, audit; user FK remaps | `src/lib/backup/register-sources.ts` |
| GAP-08 | `/dashboard/tasks` 404 | Route re-exports the tasks page | `src/app/(dashboard)/dashboard/tasks/page.tsx` |
| GAP-09 | No RBAC UI | Template assignment UI + awaiting-permissions gate + default template on invite | `/manage-system/permissions`, `src/lib/rbac/default-assignment.ts` |
| GAP-10 | No Drive connect UI | Connect/callback/disconnect routes and page | `/manage-system/drive`, `/api/google-drive/*` |
| GAP-11 | Backup schedule unused | Schedule UI, pause, cron script and API route | `/manage-system/backups`, `scripts/run-backup-schedules.ts` |
| GAP-12 | No audited deletion | Task/comment deletion with immutable snapshot + reason, GUI and MCP | `src/lib/audit/delete-with-audit.ts` |
| GAP-13 | Notifications had no reader | Notifications page + mark-all-read | `/notifications` |
| GAP-14 | MCP create/status returned no relations | Re-query with `TASK_INCLUDE` | `src/lib/mcp/tools/tasks.ts` |
| GAP-15 | Account page duplicated defaults | Uses shared `getAlertPreferences` | `manage/account/page.tsx` |
| GAP-16 | Auth hardening | Login rate limit, duplicate-email race, invite requires existing-session proof | login/register/accept actions |
| GAP-17 | No tests | 2 Vitest files / 5 tests (rate limit, status gatekeeper) | `npm test` |
| GAP-18 | No migrations | Initial migration + lock file | `prisma/migrations/20261119000000_init` |
| GAP-19 | No workspace switcher | Header switcher writes `activeCompanyId` after membership check | dashboard layout/actions |
| GAP-20 | No project/group CRUD | Create/list groups and projects with gatekeepers | `/projects`, `src/lib/projects/service.ts` |
| GAP-21 | Tags create-only | Tags page, rename/delete, attach/detach, MCP tools | `/manage-system/tags` |
| GAP-22 | Status transitions unrestricted | Transition guard + `AuditLog` write | `src/lib/mutations/tasks.ts` |
| GAP-23 | Unbounded backup list | Page/limit wrapper with total | `src/lib/backup/backup-service.ts` |
| GAP-24 | bcrypt scan over all keys | Prefix narrowing | `src/lib/mcp/callbacks.ts` |
| GAP-25 | Broken capture paths | Absolute paths in `app/CLAUDE.md` | `CLAUDE.md` |
| GAP-26 | No awaiting-permissions flow | Route + layout redirect + default assignment | `src/app/awaiting-permissions` |
| GAP-27 | No approval/audit read UI | Approval queue + audit tabs (writes, permissions, alerts) | `/manage-system/approvals`, `/manage-system/audit` |
| GAP-01 | ~~Plan gating~~ **Removed for personal edition** | No tiers, no billing, no feature gates | n/a |
| GAP-02 | No custom statuses | CustomStatus model, page, task selection, Business gate | `/manage-system/statuses` |
| GAP-03 | 11 placeholder pages | Projects, discussions, files, calendar, time, widgets, notifications, chat, daily recap, manage-system, permissions implemented | route inventory |

## Remaining gaps (not closed by code alone)

| ID | Gap | Evidence | Acceptance impact | Next action |
|---|---|---|---|---|
| GAP-R1 | ~~No runtime verification~~ **Resolved for tested paths** | `docs/domain/RUNTIME_VERIFICATION.md` | GUI, DB, MCP stdio, cron and Resend were executed | Add multi-instance and cross-DB coverage |
| GAP-R2 | ~~Backup restore never rehearsed~~ **Resolved (same DB)** | `RUNTIME_VERIFICATION.md`; restore recreated task/tag/comment/assignee with remapped IDs | Cross-database restore with different IDs still not rehearsed | Rehearse against a fresh empty DB |
| GAP-R3 | ~~Plan coverage~~ **Not applicable** | Personal edition ships every feature ungated | n/a | Build remaining product features, not gates |
| GAP-R4 | Product scope still thin | Discussions are flat (no lists/comments UI); files have no folders/versions UI; calendar has no invitees/sync; time has no billing/statistics; milestones/issues/wiki are schema-only; chat is polling, not realtime | Capture parity incomplete | Build per capture in phase order |
| GAP-R5 | Project edit/archive missing | Create/list only | Admin workflow incomplete | Add gatekeepers + UI |
| GAP-R6 | Tests are narrow | 9 unit tests; no route/gatekeeper integration suite | Regression confidence low | Add integration tests against a disposable DB |
| GAP-R7 | In-memory login rate limit | `src/lib/auth/login-rate-limit.ts` | Multi-instance deployments do not share counters | Move to DB/Redis if deployed multi-instance |
| GAP-R8 | Original Freedcamp `/iapi` surface and 476 routes remain reference-only | Capture reports | The clone is not API-compatible with Freedcamp | Treat as design reference, not a contract |
| GAP-R9 | CRM, invoices, passwords, CRM apps, SSO, white label, 2FA, Firestore chat; no billing by design | Original capture | Out of accepted scope | Planned later if required |
| GAP-R10 | Google Drive OAuth blocked by `redirect_uri_mismatch` | Connect reaches Google; OAuth client lacks `https://tms.consologist.com/api/google-drive/callback` | Blocks Drive connect, file upload success and Drive backup destination | Register the callback URI in the OAuth client or supply a dedicated client |

## Acceptance Statement

`review-required:` code-level gaps are resolved. Personal edition has no tiers or billing. Runtime verification now covers GUI auth/tasks/comments/tags/approvals/backups/restore/schedule, MCP stdio reads and writes, cron and Resend. Remaining blockers: GAP-R10 (Drive OAuth redirect URI) and cross-database restore rehearsal. See `RUNTIME_VERIFICATION.md`.
