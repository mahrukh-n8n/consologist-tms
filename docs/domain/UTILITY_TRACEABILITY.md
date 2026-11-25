# Utility Traceability — Consologist TMS

## Scope, Requirements, and Evidence Status

- Boundary: the implemented Consologist TMS slice in `/home/mahrukh/coding/freedcamp-rea/app`, plus the captured Freedcamp scope as reference-only.
- Beneficiaries and owners: workspace members, admins, MCP client operators, cron operator; architect = this doc set's owner, executor = app maintainer, reviewer = reviewer/orchestrator, TesterQA = runtime test owner.
- Sources inventoried: 45 Prisma models, 8 enums, 32 pages, 4 API routes, 43 server actions, 37 MCP tools, 36 backup sources, 6 email templates, 4 scripts, 24 nav items. Detailed files: `API_TO_GUI_MAP.md`, `ENTITY_LIFECYCLES.md`, `PAGE_CONNECTIONS.md`, `../../DOMAIN_FLOW.md`.
- Excluded scope: captured Freedcamp `/iapi` surface (330 literals), 476 captured routes, billing/plan gating, chat, dashboards, discussions/files/calendar/time/milestones/issues/wiki, Drive connect UI. Owner: product/architect. Acceptance impact: clone is incomplete by design.
- Status vocabulary: required, proposed, accepted design, statically traced, runtime verified, unresolved. **No element is runtime verified.** Compilation (`npm run build`, `tsc`, `eslint`) was observed in the parent session before this document; that is build evidence, not domain behavior.

## Full Inventory Reconciliation

| Source/category | Expected IDs and count | Mapped IDs and count | Missing IDs | Unexplained extras/duplicates | Uninspected scope and owner |
|---|---|---|---|---|---|
| Prisma models | 42 | 42 grouped as UT-ENT-01 through UT-ENT-12 | none | none | Field-by-field trace grouped by entity, not per column; owner reviewer |
| Prisma enums | 7 | 7 listed in schema | none | none | none |
| Pages | 24 | 24 as PAGE-ROOT through PAGE-PERMISSIONS | `/dashboard/tasks` nav target has no page | none | Browser rendering and responsive states; owner TesterQA |
| API routes | 1 | 1 as PAGE-CRON | none | none | Scheduler runtime and secret rotation; owner executor |
| Server actions | 20 | 20 as ACT-LOGIN through ACT-RESTORE | none | none | Runtime behavior under real DB; owner TesterQA |
| MCP tools | 14 | 14 as MCP-TASK-LIST through MCP-ACCOUNT-PREFS-UPDATE | none | none | Real stdio dispatch; owner TesterQA |
| Backup data sources | 16 | 16 as UT-BACKUP-SRC-01 through UT-BACKUP-SRC-16 | none within registered set | 26 company/domain models are outside the source set | Restore rehearsal; owner backup owner |
| Email templates | 6 | 6 as UT-EMAIL-01 through UT-EMAIL-06 | none | 4 templates have no caller | Owner reviewer |
| Scripts and jobs | 2 | 2 as UT-JOB-01 and UT-JOB-02 | none | none | Live cron and MCP boot; owner TesterQA |
| Nav items | 18 | 18 as NAV rows in PAGE_CONNECTIONS | none | 1 duplicate pageKey, 1 broken href | Client rendering; owner planner |

Counts are computed from the actual files listed in the source inventory; the element rows below expand every category. No silent sampling.

## Element Inventory

| Stable ID / exact element reference | Requirement / purpose | Producer / entry trigger | Validation / transformation | Storage or transient rationale | Concrete meaningful consumer / read path | Observable benefit / beneficiary | Terminal disposition / service boundary | Evidence / test | Status / gap |
|---|---|---|---|---|---|---|---|---|---|
| UT-AUTH-01 `loginAction`, `Session` | REQ-02 authenticate | login form | bcrypt compare; session row; JWT | Session row + cookie for revocation | `getAuthenticatedUser` on every protected page | Signed-in member | Active until logout/expiry/reset | `src/app/(auth)/login/actions.ts`; static | statically traced |
| UT-AUTH-02 `registerAction` | REQ-01 first workspace | register form | validates nonempty, email unique precheck, bcrypt hash | User, Company, role, starter data | Dashboard shell | Account and workspace | Persistent | static | statically traced |
| UT-AUTH-03 `forgotPasswordAction`, `EmailToken` | REQ-02 recovery | forgot form | one-time 32-byte token, 24h | EmailToken for reset only | Reset page link | Password recovery | Consumed or expired | static | statically traced |
| UT-AUTH-04 `resetPasswordAction` | REQ-02 recovery | reset form | token consume, bcrypt hash, delete sessions | User password + token consumption | Login page | Restored access | Password changed | static | statically traced |
| UT-AUTH-05 `acceptInviteAction` | REQ-09 membership | accept page | valid token, password ≥8, role upsert | User + role + invitation state | Dashboard shell | Member joined | Joined workspace | static | statically traced |
| UT-AUTH-06 `logoutAction` | REQ-02 session end | header form | session lookup | Session delete | Login page | Signed out | Session revoked | static | statically traced |
| UT-RBAC-01 `requirePageAccess`, `getPageAccessLevel` | REQ-03 page authorization | layout and MCP | SUPER_ADMIN bypass; template/override chain | Permission rows | Nav filter, server redirect, MCP tool list | Allowed pages only | Allowed or denied | static | statically traced |
| UT-RBAC-02 `requirePageWrite`, `requireWriteGate` | REQ-03 write authorization | server actions and MCP writes | READ_WRITE; approval flag; maker-checker | Permission rows | Task/user/backup/account actions | Safe mutations | Allowed, denied, or approval-required | static | statically traced |
| UT-RBAC-03 `PendingApproval` | REQ-03 maker-checker | write when needsApproval | JSON payload, status PENDING | Approval staging only | No reviewer UI | None reached | **No executor** | static | unresolved |
| UT-WS-01 `getActiveCompany` | REQ-01 workspace context | every shell request | cookie role check, first role, pending invite, create redirect | cookie + UserCompanyRole | `requireCompany` | Correct tenant | Workspace resolved or redirect | static | statically traced |
| UT-WS-02 `seedDefaultApplications`, `seedStarterWorkspace` | REQ-01 starter data | register and create workspace | idempotent app upsert; group/project/list/member/app install | Applications + starter project | Tasks page | Usable first workspace | Persistent | static | statically traced |
| UT-TASK-01 `createTaskSchema`, `gkCreateTask` | REQ-04/05/06 create | task form and MCP | company/project/list, parent, dates, members, tag upsert, order | Task, TaskAssignee, Tag, TaskTag | Task list and detail | Work item visible to members | Persisted or rollback | static | statically traced |
| UT-TASK-02 `gkUpdateTaskStatus` | REQ-04 status | inline select and MCP | company scope + enum; progress/completedAt derivation | Task fields | Task list/detail | Status visible | Persisted | static | statically traced |
| UT-TASK-03 `buildTaskWhere`, `presentTask`, `TASK_INCLUDE` | GUI/MCP parity | tasks page and MCP list | company scope, filters, serialization | none | Both read paths | Consistent task view | Read-only | static | statically traced |
| UT-TASK-04 `TaskAssignee` writes | REQ-05 multi-assignee | task create | project membership; composite PK | Join rows | Query include; alert recipients | Multiple owners | Persisted; no unassign path | static | statically traced |
| UT-TASK-05 `Tag` upsert and `TaskTag` | REQ-06 custom tags | task create | trim, dedupe, max 20, unique per company | Tag + join rows | Task list/detail | Reusable tags | Persisted; no rename/delete/detach | static | statically traced |
| UT-COMMENT-01 `gkCreateComment`, `createTaskComment` | REQ-07 comment | task detail and MCP | task in company; body 1..10000 | Comment row | Task detail list | Discussion record | Immutable comment | static | statically traced |
| UT-ALERT-01 `runDueAlerts` | REQ-08 due/overdue email | cron route/script | incomplete, assigned, due ≤24h, preference, dedupe | EmailAlert dedupe rows | Resend email | Assignee awareness | Email or logged failure | static | statically traced |
| UT-ALERT-02 `notifyTaskComment` | REQ-08 comment/mention email | comment creation | current assignees only; actor excluded; mention wins | EmailAlert rows | Resend email | Assignee awareness | Email or logged failure | static | statically traced |
| UT-ALERT-03 `EmailAlertPreference` | REQ-08 opt-out | account page | 4 booleans default true | Preference row | Alert service | User control | Persistent | static | statically traced |
| UT-EMAIL-01 `sendPasswordResetEmail` | REQ-02 | forgot action | template with token URL | transient email | User inbox | Reset link | Sent or logged | static | statically traced |
| UT-EMAIL-02 `sendInvitationEmail` | REQ-09 | invite service | template with token URL | transient email | Invitee inbox | Accept link | Sent or logged | static | statically traced |
| UT-EMAIL-03 `sendWelcomeEmail` | none | no caller | template only | none | none | none | Unused | static | unresolved |
| UT-EMAIL-04 `sendVerificationEmail` | none | no caller | template only | none | none | none | Unused | static | unresolved |
| UT-EMAIL-05 `sendApprovalSubmittedEmail` | none | no caller | template only | none | none | none | Unused | static | unresolved |
| UT-EMAIL-06 `sendApprovalDecisionEmail` | none | no caller | template only | none | none | none | Unused | static | unresolved |
| UT-INVITE-01 `inviteWorkspaceUser`, `gkInviteUser` | REQ-09 | users page and MCP | email, role, duplicate active invite, user-if-absent, 24h token | Invitation row | Accept page/email | Member onboarding | Pending, accepted, expired, revoked | static | statically traced |
| UT-INVITE-02 `revokeWorkspaceInvitation` | REQ-09 | users page and MCP | company + unaccepted | Invitation delete | Users page | Revoked invite | Terminal | static | statically traced |
| UT-USERS-01 `listWorkspaceUsers`, `listWorkspaceInvitations` | REQ-09 | users page and MCP | company scope | none | Users page/MCP | Membership visibility | Read-only | static | statically traced |
| UT-BACKUP-01 `createWorkspaceBackup` | REQ-10 | backup page and MCP | password ≥8; export registered sources; optional Drive | Encrypted file + Backup row | Backups list/restore | Restore point | Stored | static | statically traced |
| UT-BACKUP-02 `previewWorkspaceRestore` | REQ-10 | backups page and MCP | decrypt, checksum, source diff | none | Backups UI/MCP | Informed restore | Preview only | static | statically traced |
| UT-BACKUP-03 `executeWorkspaceRestore` | REQ-10 | backups page and MCP | password, confirm, safety export, transaction | Replaced domain rows | Whole app | Recovery | Restored or rolled back | static | unresolved |
| UT-BACKUP-04 `deleteWorkspaceBackup` | REQ-10 | backups page and MCP | company scope | none | Backups list | Storage cleanup | Deleted | static | statically traced |
| UT-BACKUP-05 `registerBackupSources` 36 sources | REQ-10 | module scope/actions/MCP | FK remaps and dependsOn | Source registry | Backup module | Export/import correctness | Registered set only | static | statically traced |
| UT-BACKUP-06 `BackupSchedule`, schedule-service | none | no caller | interval/retention | none | none | none | Unused | static | unresolved |
| UT-ACCOUNT-01 `createMcpKeyAction` | REQ-11 | account page | write gate; 24-byte key; bcrypt hash; prefix | McpApiKey | Validator at MCP boot | Agent auth | Active or revoked | static | statically traced |
| UT-ACCOUNT-02 `setMcpWritesAction` | REQ-11 | account page | write gate; boolean | User flag | MCP permission checker | Write safety switch | Persistent | static | statically traced |
| UT-ACCOUNT-03 `revokeMcpKeyAction` | REQ-11 | account page | write gate; revoke own company key | McpApiKey.revokedAt | Next MCP boot | Key lifecycle | Revoked | static | statically traced |
| UT-ACCOUNT-04 `getAlertPreferences`, `updateAlertPreferences` | REQ-08 | account page and MCP | upsert; default true | Preference row | Alert service | User control | Persistent | static | statically traced |
| UT-MCP-01 `createMcpServer`, `toolRegistry` | REQ-11 | `scripts/mcp-server.ts` | key at boot; tool filter; approval; audit | none | MCP client | Agent actions | Result/error/approval | static | statically traced |
| UT-MCP-02 `permissionChecker`, `auditWriter`, `approvalRouter` | REQ-11 | dispatch loop | READ page access; WRITE writes-toggle + gate | AuditLog; PendingApproval | MCP client | Safe audited agent actions | Per-call terminal | static | statically traced |
| UT-MCP-03 14 tools | REQ-11 | stdio JSON-RPC | Zod schema; shared gatekeepers | none | MCP client | GUI parity | Per-call terminal | static | statically traced |
| UT-PAGE-01 Implemented pages | REQ-01..11 | browser routing | auth, permissions, forms | domain rows | Members/admins | Usable slice | Page terminal | static | statically traced |
| UT-PAGE-02 Placeholder pages 11 | REQ-12/14 | nav | none | none | none | none | **No utility yet** | static | proposed |
| UT-PAGE-03 `/dashboard/tasks` nav target | REQ-04 navigation | nav | none | none | none | none | 404 | static | unresolved |
| UT-NAV-01 `nav-sections.ts` | REQ-03/04 navigation | every shell render | static data; admin filter; permission filter | none | Sidebar | Discoverability | Rendered | static | statically traced |
| UT-JOB-01 `/api/cron/due-alerts` | REQ-08 | external scheduler | bearer secret; runDueAlerts | EmailAlert | Assignees | Timely alerts | JSON counts | static | statically traced |
| UT-JOB-02 `scripts/mcp-server.ts` | REQ-11 | MCP client spawn | env key/company; registry freeze | none | MCP client | Agent access | Process lifetime | static | statically traced |
| UT-DRIVE-01 `CompanyGoogleDrive`, upload/auth/sharing | REQ-10 storage | backup adapter only | encrypted token; Drive APIs | Connection row | Backup adapter | Drive backups | Connected or absent | static | statically traced |
| UT-ENT-01 Auth models | REQ-01/02/09 | auth flows | schema constraints | Session, EmailToken, OAuthAccount, Invitation | auth services | Identity | Persistent | schema inspected | statically traced |
| UT-ENT-02 RBAC models | REQ-03 | admin templates (no UI) | unique constraints | PermissionTemplate/Page, Override, Assignment, AuditLog, PendingApproval | RBAC services | Authorization | Persistent | schema inspected | statically traced |
| UT-ENT-03 Workspace models | REQ-01/12 | seed only | unique names | Company, ProjectGroup, Project, GroupMember, ProjectMember, Application, installs | tasks page reads project | Organization | Persistent | schema inspected | statically traced |
| UT-ENT-04 Task models | REQ-04/05/06 | task gatekeepers | FKs, composite PKs, unique tag title | Task, TaskList, TaskAssignee, Tag, TaskTag | tasks UI/MCP | Work management | Persistent | schema inspected | statically traced |
| UT-ENT-05 Content models | REQ-07/12 | comment and future apps | polymorphic item keys | Comment, Discussion, FileFolder, FileRecord | comments UI; others none | Discussion/storage | Persistent | schema inspected | statically traced |
| UT-ENT-06 Tracking models | REQ-12/14 | none | schema only | TimeRecord, CalendarEvent, Milestone, Issue, SavedSearch | none | none | Persistent | schema inspected | proposed |
| UT-ENT-07 Backup/alert models | REQ-08/10 | cron and backups | unique dedupe/prefs | Backup, BackupSchedule, EmailAlert, EmailAlertPreference | services | Protection/alerting | Persistent | schema inspected | statically traced |
| UT-ENT-08 MCP/audit models | REQ-11 | key and dispatch | hash, company scope | McpApiKey, AuditLog | validator/audit writer | Agent auth/audit | Persistent | schema inspected | statically traced |
| UT-ENT-09 Drive model | REQ-10 | adapter only | encrypted token | CompanyGoogleDrive | backup adapter | Drive storage | Persistent | schema inspected | statically traced |
| UT-ENT-10 User/role/notification models | REQ-01/03 | auth/seed | unique email/role | User, UserCompanyRole, Notification | shell/header? none for notifications | Identity | Persistent | schema inspected | statically traced |
| UT-ENT-11 Schema-only app models | REQ-12 | none | none | GroupApplication, ProjectApplication, Discussion, File*, Time*, Calendar*, Milestone, Issue, SavedSearch | none | none | Persistent | schema inspected | proposed |
| UT-ENT-12 Global application catalog | REQ-12 | seed | appKey unique | Application | starter workspace only | App labels | Persistent | schema inspected | statically traced |
| UT-UI-01 shared UI primitives | GUI rules | all pages | shadcn-style components | none | rendered forms/nav | Consistent UX | Rendered | static | statically traced |
| UT-UI-02 `notify` feedback | GUI rules | client actions | success only after server result; errors persistent | none | Toaster | Action feedback | Notice lifecycle | static | statically traced |
| UT-UI-03 `PermissionProvider`, `PageAccessGuard` | REQ-03 | dashboard shell | client permission map; Access Denied | none | Page content | Soft-nav protection | Rendered | static | statically traced |
| UT-SEED-01 `seed-company-defaults.ts` | REQ-01 | register/workspace | idempotent | starter data | Tasks page | First-run usability | Persistent | static | statically traced |

## Requirement-to-Outcome and Reverse Provenance

| Requirement | Entry, actor, permissions, prerequisites | Ordered element IDs / handoff payloads | Benefit / terminal outcome | Reverse trace: output to intended sources | Real test / observation |
|---|---|---|---|---|---|
| REQ-01 | register page, visitor, no auth | UT-AUTH-02, UT-WS-02, UT-SEED-01, UT-AUTH-01 | Workspace + session | Dashboard company name and starter project derive from created rows | Not run |
| REQ-02 | login/reset pages, visitor/member | UT-AUTH-01, UT-AUTH-03, UT-AUTH-04, UT-AUTH-06 | Authenticated session / recovery | Session cookie and page access derive from User + Session | Not run |
| REQ-03 | protected page, member | UT-RBAC-01, UT-RBAC-02, UT-UI-03, UT-PAGE-01 | Allowed page access | Nav and redirects derive from permission rows and page registry | Not run |
| REQ-04 | tasks page, WRITE member | UT-TASK-01, UT-TASK-02, UT-TASK-03, UT-PAGE-01 | Visible task and status | Task list/detail derive from Task rows for company | Not run |
| REQ-05 | task form, WRITE member | UT-TASK-01, UT-TASK-04 | Multiple assignees visible | Assignee chips derive from TaskAssignee joined to User | Not run |
| REQ-06 | task form, WRITE member | UT-TASK-01, UT-TASK-05 | Reusable custom tags | Tag chips derive from TaskTag joined to Tag | Not run |
| REQ-07 | task detail, WRITE member | UT-COMMENT-01, UT-ALERT-02 | Comment + assignee email | Comment card derives from Comment row; email from task assignees | Not run |
| REQ-08 | cron, system | UT-ALERT-01, UT-ALERT-03, UT-JOB-01 | Timely assignee emails | EmailAlert rows and Resend calls derive from due tasks and prefs | Not run |
| REQ-09 | users page, admin | UT-INVITE-01, UT-INVITE-02, UT-USERS-01, UT-AUTH-05 | Member joined | Member list derives from UserCompanyRole; invite derives from Invitation | Not run |
| REQ-10 | backups page, WRITE member | UT-BACKUP-01, UT-BACKUP-02, UT-BACKUP-03, UT-BACKUP-04, UT-BACKUP-05 | Restorable backup | Backup list derives from Backup rows; restore from encrypted payload | Not run |
| REQ-11 | MCP client, key holder | UT-ACCOUNT-01, UT-MCP-01, UT-MCP-02, UT-MCP-03, UT-JOB-02 | Same business actions as GUI | Tool result derives from same gatekeepers and queries | Not run |
| REQ-12 | product scope, architect | UT-ENT-03, UT-ENT-05, UT-ENT-06, UT-PAGE-02, UT-PAGE-03 | Clone completeness | Captured routes and schemas map to placeholders/proposals | Reference only |
| REQ-13 | product scope, architect | Capture §8.1 | Plan-gated product | No implementation rows | Not run; GAP-01 |
| REQ-14 | product scope, architect | Placeholder pages and schema-only models | Full Freedcamp app | No implementation rows | Not run; GAP-03 |

Reverse trace note: every implemented element row above maps to at least one requirement. UT-EMAIL-03 through UT-EMAIL-06, UT-BACKUP-06 and the unused Google Drive sharing functions do not map to a delivered benefit and are recorded as orphans.

## Branches and Ongoing Services

| Requirement / branch | Guard and operation | Timeout / retry bound / exhaustion | Terminal outcome / compensation | Owner, stop, recovery, per-item outcomes | Evidence or inapplicability rationale |
|---|---|---|---|---|---|
| REQ-02 login success | password match; create session | no timeout/retry | Session active | auth owner; logout/expiry stops; recovery = re-login | Static only |
| REQ-02 login failure | compare false | none | Redirect with error | auth owner; recovery = retry | Static only |
| REQ-02 reset invalid token | atomic consume | token 24h; no retry | Error page | auth owner; recovery = new request | Static only |
| REQ-03 permission denied | template/override NONE; SUPER_ADMIN bypass | none | Redirect or Access Denied | RBAC owner; recovery = admin grant | Static only |
| REQ-04 task create | gatekeeper invariants; transaction | no retry; rollback on error | Task or error | task owner; recovery = retry form | Static only |
| REQ-04 approval-required create | needsApproval true | no reviewer executor | PENDING, no completion | auth owner; recovery blocked | GAP-05 |
| REQ-07 comment | task scope; post-commit alert best effort | alert failures logged, no retry | Comment committed | alert owner; recovery = manual resend absent | Static only |
| REQ-08 due/overdue alert | assigned + preference + dedupe | one pass, 500-task cap, no retry | Email or silent failure | alert owner; recovery = next run cannot retry claimed failure | GAP-06 |
| REQ-09 invite | active-invite uniqueness; email best effort | 24h expiry | Invitation pending | membership owner; recovery = revoke and re-invite | Static only |
| REQ-10 backup | password + source export | module bound; no retry UI | Backup stored or error | backup owner; recovery = retry create | Not rehearsed |
| REQ-10 restore | password + confirm + safety export | full transaction; no selective restore | Restored or rollback | backup owner; recovery = safety backup | GAP-07 |
| REQ-11 MCP READ | page READ | no timeout/retry; no read-only DB restriction | Result may include unintended writes | MCP owner; recovery = process restart | GAP-04 |
| REQ-11 MCP WRITE | writes toggle + page WRITE + approval | no retry; one audit entry | Result, error, or PENDING | MCP owner; approval dead-ends | GAP-05 |
| REQ-10 scheduled backup | BackupSchedule exists | no runner | Never runs | backup owner; stop condition absent | GAP-11 |

## Orphans and Broken Links

| Element ID | Missing purpose / producer / consumer / terminal link | Inspection and evidence | Decision: wire / safely remove / defer outside accepted scope | Impact, migration, and owner | Acceptance impact |
|---|---|---|---|---|---|
| ORPH-01 `Notification` rows | Task create writes an in-app notification; no page reads it | `createNotification` call in task action; `/notifications` placeholder | defer outside accepted scope; wire when notifications page exists | No schema migration; owner planner | Low; documented gap |
| ORPH-02 `sendWelcomeEmail` | No caller | `templates.ts` export grep | defer outside accepted scope | None; owner reviewer | Low |
| ORPH-03 `sendVerificationEmail` | No caller; `emailVerified` never set | `templates.ts`; schema field unused | defer outside accepted scope | Needs verification flow; owner architect | Medium |
| ORPH-04 `sendApprovalSubmittedEmail`, `sendApprovalDecisionEmail` | No approval executor/caller | templates + no PendingApproval transitions | defer outside accepted scope with approval flow | Tied to GAP-05; owner architect | High |
| ORPH-05 `BackupSchedule`, `runScheduledBackup`, `cleanupOldBackups`, `renameBackup` | No UI/runner caller | schema + module exports | defer outside accepted scope; wire when scheduling is built | No migration; owner backup owner | Medium |
| ORPH-06 `src/lib/mcp/api-key-resolver.ts` | Unused duplicate key lookup | validator scans keys directly | defer outside accepted scope; wire or remove after consolidation | No migration; owner MCP owner | Low |
| ORPH-07 `Application` catalog | Global rows not backed up; restore assumes catalog exists | backup source list | defer outside accepted scope with backup coverage fix | Restore depends on pre-existing catalog; owner backup owner | High |
| ORPH-08 `PendingApproval` | No reviewer UI, no approve/reject executor | `approvalRouter`; no action reads it | defer outside accepted scope; build approval queue | Blocks approval users; owner architect | High |
| ORPH-09 `EmailAlert` failure path | Claim row inserted before send; no retry | `deliver()` claim then send | defer outside accepted scope; wire retry/release | Users can miss alerts; owner alert owner | High |
| ORPH-10 Placeholder pages | Nav routes exist with no behavior | `Placeholder` files | defer outside accepted scope; implement per capture | Large scope; owner architect | High |
| ORPH-11 Schema-only models | No GUI/MCP consumer for discussions/files/time/calendar/milestones/issues | schema cross-check | defer outside accepted scope; implement later | No data migration; owner architect | High |
| ORPH-12 `TaskAssignee` removal | No unassign path | gatekeeper create-only; no delete action/tool | defer outside accepted scope; add unassign gatekeeper | Users cannot remove assignee; owner task owner | Medium |
| ORPH-13 MCP HTTP transport | No route imports `http-transport` | file grep | defer outside accepted scope | None; owner MCP owner | Low |
| ORPH-14 Google Drive auth/sharing | No connect UI/callback | module exports unused | defer outside accepted scope; build connect flow | Drive files/backups cannot be configured in-app; owner executor | High |
| ORPH-15 `SavedSearch` | No writer or reader | schema only | defer outside accepted scope | None; owner architect | Low |

## Edge Cases and Outcome Map

| Action / interaction | Outcome / edge condition | Handler, guard, and terminal disposition | Status (MAPPED/DEFERRED/MISSING) | Evidence / test |
|---|---|---|---|---|
| Create project collection 0 | No projects | Task form shows message and no submit | MAPPED | `task-form.tsx`; static |
| Create project collection 1 | One project | Preselected project and list | MAPPED | `task-form.tsx`; static |
| Create project collection N | Many projects | Searchable select, list follows project | MAPPED | `task-form.tsx`; static |
| Task assignees 0 | Unassigned task | Empty join set accepted | MAPPED | `createTaskSchema`; static |
| Task assignees 1 | Single owner | One join row | MAPPED | gatekeeper; static |
| Task assignees N | Multiple owners | Many join rows, composite PK | MAPPED | gatekeeper; static |
| Task tags 0 | No tags | Empty tag array accepted | MAPPED | schema; static |
| Task tags N | Multiple custom tags | Upsert per title, max 20 | MAPPED | gatekeeper; static |
| Task create happy | Valid input | Transaction commits task/assignees/tags | MAPPED | static |
| Task create validation rejection | Invalid project/list/date/member | Gatekeeper throws; form shows `notify` error | MAPPED | static |
| Task create double submit | Two submissions | No idempotency key; duplicate tasks possible | DEFERRED | owner task owner; risk duplicate work |
| Task create data changed since load | Project/list/assignee removed concurrently | Gatekeeper rechecks membership and ownership | MAPPED | static |
| Task create permission denied | NONE/READ_ONLY | `requireWriteGate` throws | MAPPED | static |
| Task create approval-required | needsApproval | PendingApproval created; approval queue executes the same gatekeeper | MAPPED | approval executor; static |
| Task status update happy | Any enum | Progress/completedAt recalculated | MAPPED | static |
| Task status update invalid task | Other company/missing | Gatekeeper throws/returns no-op in action | MAPPED | static |
| Task status double submit | Same status twice | Same-state transition allowed; every change audited | MAPPED | static |
| Task status data changed since load | Status changed elsewhere | Gatekeeper re-reads current status and audits the delta | MAPPED | static |
| Comment happy | Valid task/body | Comment committed; alerts best effort | MAPPED | static |
| Comment double submit | Two submissions | Duplicate comments possible | DEFERRED | no idempotency |
| Comment permission denied | READ_ONLY | Gate throws | MAPPED | static |
| Comment alert failure | Resend error | Comment remains; failure logged | MAPPED | error is contained |
| Due alert happy | Due ≤24h, assigned, pref true | Email sent once | MAPPED | static |
| Due alert duplicate run | Same due timestamp | Dedupe key prevents second send | MAPPED | static |
| Due alert send failure | Provider error | Row marked FAILED; retried after backoff up to 5 attempts | MAPPED | static |
| Due alert beyond 500 tasks | More than a batch due | Cursor pagination scans every matching task | MAPPED | static |
| Invite happy | Email/role valid | Invitation + email | MAPPED | static |
| Invite duplicate active | Same email pending | Gatekeeper throws | MAPPED | static |
| Invite email failure | Resend error | Invitation persists | MAPPED | static |
| Invite accept expired | Token time passed | Error page | MAPPED | static |
| Invite accept existing user | Email already has password | Requires a signed-in session for the same email | MAPPED | static |
| Login invalid | Wrong password/unknown email | Error redirect | MAPPED | static |
| Login double session | Login twice | Multiple sessions allowed | MAPPED | intentional |
| Reset reused token | Already consumed | Atomic consume throws | MAPPED | static |
| Backup happy | Password ≥8 | Encrypted backup stored | MAPPED | static |
| Backup wrong password on restore | Decrypt failure | Error returned | MAPPED | static |
| Restore happy | Valid password + RESTORE | Safety backup then restore | DEFERRED | not rehearsed |
| Restore interrupted | Mid-transaction failure | Transaction rollback claimed by module | DEFERRED | not rehearsed |
| MCP unauthorized key | Missing/invalid key | Boot fails fast | MAPPED | static |
| MCP writes disabled | Flag false | WRITE tool rejected | MAPPED | static |
| MCP READ isolation | READ handler invokes a write-capable helper | No read-only client supplied | DEFERRED | GAP-04; security |
| MCP approval-required | needsApproval | PendingApproval only; no executor | DEFERRED | GAP-05 |
| Cron unauthorized | Missing/wrong secret | 401 | MAPPED | static |
| Broken nav target | Click My Tasks | 404 | DEFERRED | GAP-08 |
| Placeholder page open | Any placeholder route | Static note only | DEFERRED | GAP-03 |
| Delete task | No delete action/tool | Not offered | DEFERRED | deletion rule unimplemented |

## Behavioral Acceptance

- [x] Every inventoried element accounted for; unresolved coverage and gaps disclosed.
- [ ] No unexplained orphan, critical broken handoff, or branch without disposition in accepted scope.
- [ ] Forward tests show representative input changes affect intended benefits; reverse evidence proves outputs originate from intended sources.
- [ ] Applicable negative branches, terminal states, retry bounds/exhaustion, compensation, and ongoing-service per-item outcomes tested.
- [ ] Actual commands/scenarios, sources, expectations, observations, results, and limitations recorded. A file, field, or table existing is not behavioral proof.
- [x] `check_utility_traceability.py` run and its exit status recorded after writing this document; placeholders replaced. Result: pass, exit 0, 164 real rows, 0 placeholder rows (2026-11-19).
- [ ] Concurrent write, double-submit, and interrupted-write behavior tested at the gatekeeper layer or explicitly deferred with owner and risk; no read-modify-write without a stated race guard.
- [x] Proposed, accepted-design, static, and runtime claims remain distinct.
- [x] Architect owns the journey; planner preserves IDs and scope; executor implements and updates traces; reviewer checks completeness and semantics; TesterQA records real behavior.
- [ ] High-stakes acceptance complete; GAP-04, GAP-05, GAP-07 block.

`review-required: utility trace complete at category level; runtime behavior, approval, backup rehearsal, and MCP READ isolation remain unresolved.`
