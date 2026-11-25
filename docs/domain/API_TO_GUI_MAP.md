# API-to-GUI Map — Consologist TMS

Last checked: 2026-11-19. Sources: `src/app/**/actions.ts`, `src/app/api/**/route.ts`, `src/lib/mcp/tools/**`, `src/lib/**`, `src/modules/**`, `prisma/schema.prisma`.

## Contract Source Inventory

| Source | Exact location | Declared coverage | Last checked / evidence status |
|---|---|---|---|
| GUI server actions | `src/app/**/actions.ts` (12 files, 20 exports) | Auth, tasks, comments, account, users, backups | 2026-11-19; statically traced |
| API route | `src/app/api/cron/due-alerts/route.ts` | Due/overdue alerts | 2026-11-19; statically traced |
| MCP tools | `src/lib/mcp/tools/{tasks,backups,users,account}.ts` | 14 tools | 2026-11-19; statically traced |
| Gatekeepers/services | `src/lib/mutations/*`, `src/lib/{tasks,users,backup,account,notifications}/*` | Shared write/read truth | 2026-11-19; statically traced |
| Portable modules | `src/modules/{auth-session,auth-rbac,backup,google-drive,mcp}` | Auth, RBAC, backup, Drive, MCP transport | 2026-11-19; statically traced |
| Captured Freedcamp API | `/home/mahrukh/rea-analysis/freedcamp/iapi-endpoints.txt` (330) | Reference `/iapi/*` surface | 2026-11-19; reference-only, not implemented |
| Captured Freedcamp routes | `/home/mahrukh/rea-analysis/freedcamp/routes.txt` (476) | Reference routes | 2026-11-19; reference-only |

## Endpoint / Action Contract Matrix — GUI Server Actions (20)

| Stable ID / exact function | Method | Required inputs | Optional inputs | Request body/schema | Response fields/schema | Errors | Concrete GUI placement | Entity/state effects | Evidence, status, gaps |
|---|---|---|---|---|---|---|---|---|---|
| ACT-LOGIN `loginAction` | POST (form) | email, password | returnTo | FormData | redirect + `auth-session` cookie | invalid credentials → `/login?error=invalid` | `/login` form | creates `Session` | `src/app/(auth)/login/actions.ts`; statically traced |
| ACT-REGISTER `registerAction` | POST | fullName, email, password ≥8, workspace | — | FormData | redirect `/dashboard` + cookie | invalid/existing → `/register?error=*`; DB unique race unhandled | `/register` form | creates User, Company, SUPER_ADMIN role, starter group/project/list/apps | statically traced; race gap |
| ACT-FORGOT `forgotPasswordAction` | POST | email | — | FormData | redirect `/forgot-password?sent=1` | always generic | `/forgot-password` | creates `EmailToken`; sends email best-effort | statically traced |
| ACT-RESET `resetPasswordAction` | POST | token, password ≥8 | — | FormData | redirect `/login` | invalid token → error redirect | `/reset-password` | consumes token; updates password; deletes sessions | statically traced |
| ACT-ACCEPT `acceptInviteAction` | POST | token, fullName, password ≥8 | — | FormData | redirect `/dashboard` + cookie | invalid/expired → error redirect | `/accept-invite` | updates user; upserts role; marks invitation accepted | statically traced; password-overwrite risk |
| ACT-WS `createWorkspaceAction` | POST | name | — | FormData | redirect `/dashboard` | DB error | `/companies/new` | creates Company, SUPER_ADMIN role, starter data | statically traced |
| ACT-LOGOUT `logoutAction` | POST | — | — | FormData | redirect `/login` | — | dashboard header | deletes session + cookie | statically traced |
| ACT-TASK-CREATE `createTaskAction` | POST | projectId, listId, title | description, status, priority, dueAt, assigneeIds, tags | `createTaskSchema` | `{success,error?,approvalRequired?}` | Zod/gatekeeper messages | `/tasks` form | creates Task + TaskAssignee + Tag/TaskTag, or PendingApproval | statically traced |
| ACT-TASK-STATUS `updateTaskStatusAction` | POST | taskId, status | — | `updateTaskStatusSchema` | void | silently returns on invalid parse | `/tasks` and detail status form | updates status/progress/completedAt | statically traced |
| ACT-COMMENT `addTaskCommentAction` | POST | taskId, body | — | `addCommentSchema` | `{success,error?}` | Zod/gatekeeper; approval branch | `/tasks/[id]` comment form | creates Comment + alerts, or PendingApproval | statically traced |
| ACT-KEY-CREATE `createMcpKeyAction` | POST | label | — | FormData | `{success,rawKey?}` | permission error | `/manage/account` | creates `McpApiKey` | statically traced |
| ACT-WRITES `setMcpWritesAction` | POST | enabled | — | FormData | void | permission error | `/manage/account` | updates `User.mcpWritesEnabled` | statically traced |
| ACT-KEY-REVOKE `revokeMcpKeyAction` | POST | id | — | FormData | void | permission error | `/manage/account` | sets `revokedAt` | statically traced |
| ACT-PREFS `updateAlertPrefsAction` | POST | dueSoon, overdue, comment, mention | — | FormData | void | permission error | `/manage/account` | upserts `EmailAlertPreference` | statically traced |
| ACT-INVITE `inviteUserAction` | POST | email, role | — | `inviteUserSchema` | `{success,error?}` | duplicate active invite; email failure logged | `/manage-system/users` | creates User if absent + Invitation | statically traced |
| ACT-INVITE-REVOKE `revokeInvitationAction` | POST | id | — | `revokeInvitationSchema` | void | not found throws | `/manage-system/users` | deletes pending invitation | statically traced |
| ACT-BACKUP-CREATE `createBackupAction` | POST | password ≥8 | — | `createBackupSchema` | `{success,error?}` | gatekeeper/export errors | `/manage-system/backups` | creates `Backup` + files/Drive object | statically traced; not rehearsed |
| ACT-BACKUP-DELETE `deleteBackupAction` | POST | id | — | `deleteBackupSchema` | void | not found/API errors | backups row | deletes backup storage + row | statically traced |
| ACT-RESTORE-PREVIEW `previewRestoreAction` | POST | id, password | — | `previewRestoreSchema` | `{success,preview?}` | decrypt/checksum/source errors | backups row | reads and validates backup | statically traced |
| ACT-RESTORE `executeRestoreAction` | POST | id, password, confirm=`RESTORE` | — | `restoreBackupSchema` | `{success,error?}` | confirm/decrypt/restore errors | backups row | safety backup then full restore | statically traced; **not rehearsed** |

## Endpoint / Action Contract Matrix — API Route (1)

| Stable ID / exact endpoint | Method | Required inputs | Optional inputs | Request body/schema | Response fields | Errors | Concrete placement | Entity/state effects | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| PAGE-CRON `/api/cron/due-alerts` | GET, POST | `Authorization: Bearer CRON_SECRET` or `x-cron-secret` | — | none | `{dueSoon,overdue,scanned}` | 401 if secret missing/mismatch | external scheduler | creates `EmailAlert`; sends email | statically traced |

## MCP Tool Contract Matrix (14)

| Stable ID / exact tool | Access | Required inputs | Optional inputs | Schema | Result | Errors | Shared implementation | Status |
|---|---|---|---|---|---|---|---|---|
| MCP-TASK-LIST `tasks.list` | READ | — | projectId, listId, status, assigneeId, page, pageSize | `listTasksSchema` | task array with assignees/tags | permission denied | `buildTaskWhere`, `presentTask`, `TASK_INCLUDE` | statically traced |
| MCP-TASK-CREATE `tasks.create` | WRITE | projectId, listId, title | description, status, priority, dueAt, assigneeIds, tags | `createTaskSchema` | created task (relations omitted in response) | permission/validation | `gkCreateTask` | statically traced |
| MCP-TASK-STATUS `tasks.update_status` | WRITE | taskId, status | — | `updateTaskStatusSchema` | updated task (relations omitted) | permission/validation | `gkUpdateTaskStatus` | statically traced |
| MCP-TASK-COMMENT `tasks.comment` | WRITE | taskId, body | — | `addCommentSchema` | comment identity | permission/validation | `createTaskComment` → `gkCreateComment` | statically traced |
| MCP-BACKUP-LIST `backups.list` | READ | — | — | empty transform | backup list | permission | `listWorkspaceBackups` | statically traced |
| MCP-BACKUP-CREATE `backups.create` | WRITE | password ≥8 | — | `createBackupSchema` | export result | permission/export | `createWorkspaceBackup` | statically traced |
| MCP-BACKUP-PREVIEW `backups.preview_restore` | READ | backupId, password | — | `previewRestoreSchema` | manifest/missing/extra/warnings | permission/decrypt | `previewWorkspaceRestore` | statically traced |
| MCP-BACKUP-RESTORE `backups.restore` | WRITE | backupId, password, confirm=`RESTORE` | — | `restoreBackupSchema` | restore result | permission/decrypt | `executeWorkspaceRestore` | statically traced; not rehearsed |
| MCP-BACKUP-DELETE `backups.delete` | WRITE | backupId | — | `deleteBackupSchema` | `{deleted:true}` | permission | `deleteWorkspaceBackup` | statically traced |
| MCP-USERS-LIST `users.list` | READ | — | — | empty transform | members + invitations | permission | `listWorkspaceUsers`, `listWorkspaceInvitations` | statically traced |
| MCP-USERS-INVITE `users.invite` | WRITE | email, role | — | `inviteUserSchema` | invitation identity | permission/duplicate | `inviteWorkspaceUser` → `gkInviteUser` | statically traced |
| MCP-USERS-REVOKE `users.revoke_invitation` | WRITE | invitationId | — | `revokeInvitationSchema` | `{revoked:true}` | permission/not found | `revokeWorkspaceInvitation` | statically traced |
| MCP-ACCOUNT-PREFS `account.get_alert_prefs` | READ | — | — | empty transform | 4 booleans | permission | `getAlertPreferences` | statically traced |
| MCP-ACCOUNT-PREFS-UPDATE `account.update_alert_prefs` | WRITE | 4 booleans | — | `updateAlertPreferencesSchema` | saved prefs | permission | `updateAlertPreferences` | statically traced |

MCP dispatch validates the API key once at boot (`MCP_API_KEY`, `MCP_COMPANY_ID`), filters tools by page permission, enforces `mcpWritesEnabled` for WRITE, routes approval-required writes to `PendingApproval`, and writes one audit entry per invocation. READ tools currently receive the unrestricted Prisma client (`runReadOnlyTool` is not supplied) — GAP-04.

## GUI Actions → Shared Implementation

| Page/screen | Control/action | Actual API/function | Shared implementation | Rendered output / recipient | Empty/error/loading | Benefit |
|---|---|---|---|---|---|---|
| `/login` | Sign in | `loginAction` | auth-session | redirect / error text | pending submit; error text | Session |
| `/register` | Create account | `registerAction` | seed + auth-session | redirect | error text | Account/workspace |
| `/tasks` | Add task | `createTaskAction` | `gkCreateTask` | list refreshes | `notify` error/success; pending | Task |
| `/tasks` | Status save | `updateTaskStatusAction` | `gkUpdateTaskStatus` | row status | invalid parse silent | Status |
| `/tasks/[id]` | Add comment | `addTaskCommentAction` | `createTaskComment` → `gkCreateComment` | comment list | `notify`; pending | Comment + alerts |
| `/tasks` | Open task | link + new-tab icon | — | detail page | `notFound()` | Navigation |
| `/manage/account` | Create/revoke key; toggle writes; save prefs | `createMcpKeyAction`, `revokeMcpKeyAction`, `setMcpWritesAction`, `updateAlertPrefsAction` | key/preferences services | key once; badges; checkboxes | `notify`; pending | MCP/alert control |
| `/manage-system/users` | Invite/revoke | `inviteUserAction`, `revokeInvitationAction` | `inviteWorkspaceUser`, `revokeWorkspaceInvitation` | member/invite lists | `notify`; pending | Membership |
| `/manage-system/backups` | Create/preview/restore/delete | backup actions | `backup-service` | backup table + preview | `notify`; `<details>`; pending | Data protection |
| `/forgot-password` | Send link | `forgotPasswordAction` | auth-session email | generic sent message | always generic | Reset |
| `/reset-password` | Update password | `resetPasswordAction` | auth-session tokens | redirect login | error text | Recovery |
| `/accept-invite` | Join | `acceptInviteAction` | invitation + session | redirect dashboard | error text | Membership |

## APIs Without GUI Placement

| API/function | Classification | Reason, concrete consumer, owner | Follow-up / acceptance impact |
|---|---|---|---|
| `scripts/send-due-alerts.ts` | backend-only/internal | Cron operator; same `runDueAlerts` as API route | None |
| `scripts/mcp-server.ts` | backend-only/internal | External MCP client (stdio) | None |
| `sendWelcomeEmail`, `sendVerificationEmail`, `sendApprovalSubmittedEmail`, `sendApprovalDecisionEmail` | future | No caller | Wire or remove (ORPH-05) |
| `google-drive` auth/sharing functions (`buildAuthUrl`, `exchangeCode`, `shareFolder`, `listPermissions`, `removePermission`) | future | No connect UI | GAP-10 |
| `backup` schedule/retention (`runScheduledBackup`, `cleanupOldBackups`, `renameBackup`) | backend-only/internal/future | No UI caller; `BackupSchedule` unused | GAP-11 |
| `mcp` HTTP transport (`http-transport.ts`) | future | No `/api/mcp` route | Excluded from current accepted scope |
| Captured Freedcamp `/iapi/*` (330 endpoints) | reference-only | Clone target; not implemented | Scope backlog |
| Captured Freedcamp `routes.txt` (476) | reference-only | Clone target; not implemented | Scope backlog |

## GUI Without Backing Contract

| GUI action | Current backing | Risk, status, owner | Follow-up |
|---|---|---|---|
| `/projects`, `/discussions`, `/files`, `/dashboard/calendar`, `/dashboard/time`, `/dashboard/widgets`, `/notifications`, `/chat`, `/daily-recap`, `/manage-system`, `/manage-system/permissions` | `mock/static` placeholder (`Placeholder` component) | Declared nav surfaces have no backing | Implement or hide (GAP-03) |
| `/dashboard/tasks` nav item | `not-found` (no route) | Broken primary nav | Fix or remove (GAP-08) |
| In-app notification bell/feed | `not-found` (no UI); `Notification` writes exist | Write-only rows | Wire reader (ORPH-04) |

## Per-field Utility and Full Coverage

Full trace: `docs/domain/UTILITY_TRACEABILITY.md`.

| Source/category | Expected IDs and count | Mapped IDs | Missing, extra, duplicate IDs | Owner / remaining boundary |
|---|---|---|---|---|
| Server actions | 20 | ACT-* 20 | 0 missing; 0 duplicate | Executor/reviewer |
| MCP tools | 14 | MCP-* 14 | 0 missing | Executor/reviewer |
| API routes | 1 | PAGE-CRON | 0 | Executor |
| Prisma models | 42 | ENT-* grouped 12 | 0 missing; 0 duplicate | Architect/reviewer |
| Pages | 24 | PAGE-* 24 | 1 nav target absent | Planner |
| Nav items | 18 | NAV rows 18 | 1 duplicate pageKey | Planner |
| Backup sources | 16 | UT-BACKUP-SRC | 0 missing; 26 company/domain models outside source set | Backup owner (GAP-07) |
| Email templates | 6 | ORPH-05 | 3 used / 3 unused | Reviewer |

Saving or forwarding alone is not utility. Secrets, raw MCP keys, session tokens and password hashes are intentionally transient or one-time; they are not persisted in domain docs.

## Branches and Behavioral Verification

| Action / branch | Guard | Retry bound, exhaustion, timeout, compensation | Terminal outcome | Actual test / observation |
|---|---|---|---|---|
| Login | bcrypt match | none; no rate limit | session / error | Not run |
| Register | email uniqueness precheck + DB constraint | none; unique race unhandled | workspace / 500 | Not run |
| Task create | gatekeeper ownership/date/membership | transaction rollback | task / error | Not run |
| Approval-required create | `requiresApproval` | no reviewer executor | PENDING forever | Not run; GAP-05 |
| Comment | task scope | alert failures logged, comment kept | comment | Not run |
| Due alert | pref + dedupe | `take:500`, no retry, no pagination | email / silent miss | Not run; GAP-06 |
| Backup create | password + source export | module failure surfaces | backup | Not run |
| Restore | confirm + safety export | full destructive | restored / error | Not run; GAP-07 |
| Invite | active-invite uniqueness | email best-effort | invitation | Not run |
| MCP call | key + page permission + writes toggle | one audit entry; no retry | result/error/approval | Not run |
| MCP READ | page READ | **no read-only DB restriction** | read may write | GAP-04 |

- [x] Required/optional inputs, rendered fields, concrete controls, entity effects complete for implemented actions.
- [x] Backend-only/internal uses justified; mock/static surfaces labeled.
- [x] Full inventory reconciliation and bidirectional trace present; no silent sampling at category level.
- [x] Proposed, accepted-design, statically traced, runtime-verified, and unresolved statuses distinct.
- [ ] Real tests demonstrate input-to-benefit effects, output provenance, and branch terminal outcomes.
- [x] Architect/planner/executor/reviewer/TesterQA ownership recorded.
- [ ] High-stakes acceptance complete; GAP-04/05/07 block.

`review-required: API/action inventory and parity mapping ready for acceptance; runtime and three blocking gaps remain.`
