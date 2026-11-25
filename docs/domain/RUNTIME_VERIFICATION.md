# Runtime Verification — Consologist TMS

Date: 2026-11-20
Database: PostgreSQL `consologist_tms_verify` at `127.0.0.1:5434`
Runtime: Node 24.22.1, Next.js dev server, Chromium 153 (headless, REA CDP capture)
Auth accounts: `tms.owner@example.com` (SUPER_ADMIN), `tms.member@example.com` (WRITE)

## Migrations applied

1. `20261119000000_init`
2. `20261120000000_google_drive_preference` (`preferLocalStorage`)
3. `20261120010000_comment_project_relation` (`comments.project_id` FK)

## Browser-verified flows (real UI, real DB)

| Flow | Result | Evidence |
|---|---|---|
| Register user + workspace | ✅ dashboard with starter project | `/dashboard` |
| Login, logout, re-login | ✅ session cookie honored | `/login` |
| Workspace switcher | ✅ rendered with membership | header |
| Plan tiers | ~~Removed~~ personal edition: no tiers, no billing, no gating | schema + UI |
| Create group + project | ✅ project with list/apps | `/projects` |
| Invite user + accept invite | ✅ membership + WRITE template assigned | `/manage-system/users`, `/accept-invite` |
| RBAC template assignment | ✅ member moved WRITE → READ_ONLY | `/manage-system/permissions` |
| Custom status creation | ✅ available to all members | `/manage-system/statuses` |
| Task create with 2 assignees, tags, custom status | ✅ all persisted | `/tasks` |
| Inline status change | ✅ `AuditLog` STATUS_CHANGE row | `/tasks` |
| Comment with `@mention` | ✅ comment stored; mention alert row | `/tasks/3` |
| Tag attach/detach | ✅ join rows; detach button | `/tasks/3` |
| Approval flow | ✅ member create → PENDING; owner approve → task created, APPROVED | `/manage-system/approvals` |
| Task delete with reason | ✅ task removed + `DeletionAudit` | task detail |
| Comment delete with reason | ✅ comment removed + `DeletionAudit` | task detail |
| Tag rename/delete | ✅ renamed `extra` → `extras` | `/manage-system/tags` |
| Backup create | ✅ 37 sources, DB + filesystem, 2.9 KB | `/manage-system/backups` |
| Backup preview | ✅ source/row counts, missing/extra sources | `/manage-system/backups` |
| Backup restore (full) | ✅ task/list/assignee/tag/comment recreated with remapped IDs; safety backup created first | `/manage-system/backups` |
| Backup schedule save | ✅ interval/retention persisted | `/manage-system/backups` |
| Scheduled backup cron | ✅ `backups:schedule` created backup #9, advanced `next_run_at` | script |
| Notifications list + mark read | ✅ unread → 0 | `/notifications` |
| Discussions create/list | ✅ discussion row | `/discussions` |
| Calendar create/list | ✅ event row (UTC-normalized) | `/dashboard/calendar` |
| Time create/list | ✅ 45m record, totals | `/dashboard/time` |
| Chat send/list | ✅ message row | `/chat` |
| Widgets / Daily recap / Manage / Audit / Drive pages | ✅ render with real data | multiple |

## MCP stdio verification (real subprocess, real DB)

- `initialize` ✅, `tools/list` ✅ (37 tools)
- READ: `tasks.list`, `backups.list`, `tags.list`, `permissions.list`, `files.list` ✅
- WRITE: `tasks.create` (multi-assignee + tags + custom status) ✅
- `tasks.update_status` ✅, `tasks.comment` ✅, `tasks.delete` ✅ (audit row)
- `tags.attach` ✅, `permissions.assign_template` ✅
- `discussions.create`, `calendar.create`, `time.create`, `chat.send`, `notifications.mark_read` ✅
- `users.invite` ✅
- `backups.create` ✅
- `files.upload` ✅ fails closed with "Google Drive is not connected"

## Email

- Resend accepted a real send to the configured account owner: `EMAIL_ACCEPTED`.
- Alerts to `example.com` were rejected by Resend, recorded as `FAILED` with attempts/error and retry state — correct fail-closed behavior.

## Google Drive

- Connect route reaches Google with the configured client ID and asks for Drive scope.
- **Blocked:** Google returns `redirect_uri_mismatch` because the accountant OAuth client does not have `http://localhost:3000/api/google-drive/callback` registered.
- Consequence: Drive connection, file upload success, and Drive backup destination remain unverified until the redirect URI is registered or a dedicated OAuth client is provided.

## Defects found and fixed during runtime testing

1. Missing `CompanyGoogleDrive.preferLocalStorage` (drive module expected it).
2. Backup child-source company filters assumed parent had `companyId`; fixed with nested group filters.
3. `Comment` lacked a Project relation; added FK.
4. Task `customStatusId` was not remapped on restore.
5. Backup dependencies missed `users` for sources remapping user IDs; restore failed with missing ID maps.
6. Application catalog and link fields were not remapped; added applications source + remaps.
7. MCP stdio exited before in-flight requests; now drains pending requests.
8. Duplicate form field IDs in repeated forms; now prefixed by action ID.
9. Restore form controls had no unique IDs; added per-backup IDs.

## Limits

- Single-node local Postgres; no multi-instance rate-limit test.
- Same-server restore only; cross-database restore with different IDs not rehearsed.
- No Drive OAuth completion, so no Drive upload/backup test.
- Original Freedcamp `/iapi` surface, CRM, invoices, passwords, SSO, white label, 2FA remain out of scope.

## Public domain and Cloudflare tunnel (2026-11-20)

| Item | Value |
|---|---|
| Public URL | `https://tms.consologist.com` |
| Tunnel | `tms-consologist` (`f5849aa5-d146-4833-b4f4-8737cfa9201d`) |
| Config | `~/.cloudflared/tms-config.yml` |
| Origin | `http://127.0.0.1:3000` |
| DNS | CNAME `tms.consologist.com` → tunnel |
| App env | `APP_URL=https://tms.consologist.com`, Drive callback on the same host |

Verified: `curl` returns 200 with Next.js headers; headless Chromium loads the login page from the public hostname and renders the expected controls.

Run after reboot:

```bash
cloudflared --config ~/.cloudflared/tms-config.yml tunnel run
```

Google Drive OAuth still needs `https://tms.consologist.com/api/google-drive/callback` registered in the Google OAuth client (GAP-R10).

## UI refactor — Vibrant & Block-based (2026-11-20)

- Design system: three-layer tokens in `src/app/globals.css`, fonts Lexend Mega + Public Sans, block borders/shadows, accessible palette (primary 7.10:1, lime 15.18:1, pink 4.52:1, cyan 8.67:1, orange 8.00:1, muted 6.81:1).
- New shared components: `AssigneePicker`, `DateTimePicker`, `TagInput`, `BlockSelect`, active `SidebarNav`, mobile drawer.
- Refactored: auth shell, dashboard shell/home, tasks page/form/list/detail, projects, discussions, calendar, time, files, chat, notifications, widgets, account, users, permissions, approvals, audit, statuses, tags, backups, drive, documents.
- Functional picker test: created `UI Picker Task` through the browser with 1 assignee, 2 tags, In Progress, High, custom status Blocked, due 2026-11-25; database confirmed each value.
- Mobile: 390×844 verified with no document horizontal overflow (`scrollWidth 390 = clientWidth 390`); mobile drawer opens with active highlighting.
- Screenshots: `/home/mahrukh/rea-analysis/freedcamp/ui-shots/` (desktop) and `ui-shots-mobile/` (390px).
- Verification: `tsc`, `eslint`, 9 unit tests, `next build` all pass.

### Selector changes

- `#assigneeIds` is now the picker trigger (was a native multi-select). `select_option` no longer applies; use the picker options (`role=option`).
- `#dueAt`, `#startAt`, `#endAt`, `#date` are date-picker triggers with hidden inputs of the same name.
- `#status`, `#priority`, `#customStatusId`, `#status-<taskId>` are `BlockSelect` triggers; their options expose `role=option`.
- IDs used by create forms, backups, comments, tags and permissions were preserved.

## Themes, task lists, board (2026-11-20)

| Check | Result |
|---|---|
| Default theme | ✅ Flat Design (token set on load; no block flash) |
| Theme switch | ✅ top-right Flat / Block toggle; persists in `localStorage` (`tms-theme`) |
| Block theme retained | ✅ Vibrant & Block-based tokens/overrides |
| Create task list | ✅ "Sprint Backlog" created under a project (DB row + toast) |
| Rename/archive list | ✅ actions wired; archive blocks non-empty lists |
| Board view | ✅ `/tasks?view=board` renders No Progress / In Progress / Completed columns |
| List view | ✅ default `/tasks`, **grouped by task list** (project + list heading, count, Open list); filters via `projectId` / `listId` |
| MCP parity | ✅ `task_lists.list/create/rename/archive`; approval handler for `TaskList` |
| Verification | ✅ tsc, eslint, 9 tests, next build |

Evidence: `/home/mahrukh/rea-analysis/freedcamp/ui-theme/flat.png`, `block.png`, `list-settle.png`, `board-settle.png`.

## Documents (MDX editor, outline, voice) — 2026-11-20

| Check | Result |
|---|---|
| Project documents entity | ✅ `ProjectDocument` + `DocumentAttachment` models, migration applied |
| Documents page | ✅ `/documents`, create "Verification Doc" from UI |
| Drawer | ✅ opens; MDXEditor loads; title/content save |
| Outline | ✅ headings detected (`Details`, `Deep section`); panel toggle and heading scroll wired |
| Attachments | ✅ MCP attach `note.txt`; listed with size; download route `/api/documents/attachments/:id` |
| Voice note | ✅ recorder/player UI wired; microphone capture not exercised in headless test |
| Versioning | ✅ save bumped v2→v3; stale version rejected |
| Delete | ✅ MCP delete “Disposable Doc” created `DeletionAudit` `ProjectDocument` |
| MCP parity | ✅ `documents.list/get/create/update/delete/add_attachment/delete_attachment` |
| Markdown description fields | ✅ Task description, discussion body, project description, calendar description, task comment |
| Verification | ✅ tsc, eslint, 9 tests, next build |


## Personal edition (no tiers or billing)

The app is a personal tool: the `Plan` enum/column, feature gates, plan page and upgrade prompts were removed. Every member sees every implemented feature; RBAC still governs page access and approvals.

## Markdown/Formatted toggle, multi-level outline, task table (2026-11-20)

| Check | Result |
|---|---|
| Markdown / Formatted toggle | ✅ editor header toggle; source textarea shows raw markdown, formatted view restores editor |
| Toggle on description fields | ✅ same component used by task/discussion/project/calendar/comment fields |
| Multi-level outline | ✅ headings at every level (Verification → Details → Deep section → Deeper level) each get a collapse control |
| Collapse individual | ✅ collapsing Deep section hides only its subtree; sibling headings remain |
| Collapse / Expand all | ✅ full tree collapses and restores |
| Table view | ✅ `/tasks?view=table`; column picker saved in `localStorage`; Project column persisted after reload |
| Search/filters | ✅ search + project/list/status/priority/assignee/due filters; URL-persisted across List/Board/Table |
| All task lists | ✅ empty lists shown with “No tasks in this list yet.” |
| Personal edition | ✅ plan enum/column, gates, plan page and upgrade prompts removed; no billing |

## Task inline editing, preview folding, toolbar dropdown (2026-11-20)

| Check | Result |
|---|---|
| Edit from table | ✅ pencil opens full editor; title changed and persisted |
| Edit from list/board/detail | ✅ same `TaskEditButton` wired in every view |
| Editable fields | ✅ title, description, project, list, status, priority, due, custom status, assignees, tags |
| MCP parity | ✅ `tasks.update` with the same gatekeeper + approval handler |
| Heading dropdown | ✅ Block type combobox shows Paragraph/Quote/Heading 1–6 |
| Preview mode | ✅ formatted, collapsible preview with per-heading and all-level folding |
| Preview collapse | ✅ collapsing Verification hides Details/Deep/Another; Expand all restores |

## Task editing all views + dropdown visibility (2026-11-20)

| Check | Result |
|---|---|
| Edit button visible | ✅ list, board, table, task detail (“Edit” label / pencil) |
| Detail edit | ✅ `tasks/9` edited as its workspace owner |
| Assignee change | ✅ picker option selected, `task_assignees` row created |
| All task fields | ✅ title, description, project, list, status, priority, due, custom status, assignees, tags |
| MCP parity | ✅ `tasks.update` |
| Block-type dropdown | ✅ visible above content (popup z-index 200); options Paragraph/Quote/Heading 1–6 |

## Inline task editing (2026-11-20)

| Check | Result |
|---|---|
| Detail Overview inline | ✅ all fields are inputs/selects with Save changes |
| Editable fields | title, project, list, status, priority, due, progress %, custom status, assignees, tags |
| Table row inline | ✅ Edit expands an inline editor row; saved |
| List / board | ✅ same inline editor component |
| Progress | ✅ manual 0–100 value persisted (65) |
| Block-type dropdown | ✅ visible (screenshot `dropdown-fixed.png`) |

## Lean tasks page + full inline editing (2026-11-20)

| Check | Result |
|---|---|
| Lean layout | ✅ no large create/list cards; toolbar only (Filters / Lists / New task) |
| Filters hidden by default | ✅ open on demand |
| New task | ✅ right drawer |
| Lists manager | ✅ on-demand panel (create/rename/archive) |
| Inline title | ✅ edited, persisted |
| Inline status | ✅ Completed → In Progress, persisted |
| Inline tags | ✅ `inline-tag` added, persisted |
| Inline progress | ✅ 40% persisted |
| Inline assignees/due/priority/custom status/project/list | ✅ same components in list, board, table |
| Empty lists | ✅ compact heading only |
