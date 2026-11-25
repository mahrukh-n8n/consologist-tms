/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * App-side backup bridge for Consologist TMS.
 * Registers every company-scoped domain table as a backup data source.
 */
import { dataSourceRegistry } from "@/modules/backup";
import type { BackupIdMaps, DataSource } from "@/modules/backup";
import { BACKUP_GROUP } from "./groups";

 
type AnyRow = any;

function remap(idMaps: BackupIdMaps, source: string, oldId: number | null | undefined) {
  if (oldId == null) return oldId;
  const map = idMaps[source];
  if (!map) throw new Error(`Restore blocked: missing ID map for ${source}[${oldId}]`);
  const next = map.get(oldId);
  if (typeof next !== "number") throw new Error(`Restore blocked: unmapped ${source}[${oldId}]`);
  return next;
}

function simpleSource(opts: {
  key: string;
  displayName: string;
  group: string;
  dependsOn: string[];
   
  model: (db: any) => any;
  remapFks?: (row: AnyRow, idMaps: BackupIdMaps) => void;
}): DataSource {
  return {
    key: opts.key,
    displayName: opts.displayName,
    group: opts.group,
    dependsOn: opts.dependsOn,
    export: (db, companyId) => opts.model(db).findMany({ where: { companyId } }),
    import: async (db, companyId, rows, idMaps) => {
      if (!idMaps[opts.key]) idMaps[opts.key] = new Map();
      for (const raw of rows) {
        const row = { ...(raw as AnyRow) };
        const oldId = row.id;
        delete row.id;
        row.companyId = companyId;
        opts.remapFks?.(row, idMaps);
        const created = await opts.model(db).create({ data: row });
        idMaps[opts.key]!.set(oldId, created.id);
      }
    },
    count: (db, companyId) => opts.model(db).count({ where: { companyId } }),
    clear: (db, companyId) => opts.model(db).deleteMany({ where: { companyId } }),
  };
}

function childSource(opts: {
  key: string;
  displayName: string;
  group: string;
  dependsOn: string[];
   
  model: (db: any) => any;
  parentRelation: string;
  companyWhere?: (companyId: number) => Record<string, unknown>;
  remapFks?: (row: AnyRow, idMaps: BackupIdMaps) => void;
}): DataSource {
  const companyWhere = (companyId: number) =>
    opts.companyWhere ? opts.companyWhere(companyId) : { [opts.parentRelation]: { is: { companyId } } };
  return {
    key: opts.key,
    displayName: opts.displayName,
    group: opts.group,
    dependsOn: opts.dependsOn,
    export: (db, companyId) => opts.model(db).findMany({ where: companyWhere(companyId) }),
    import: async (db, _companyId, rows, idMaps) => {
      if (!idMaps[opts.key]) idMaps[opts.key] = new Map();
      for (const raw of rows) {
        const row = { ...(raw as AnyRow) };
        const oldId = row.id;
        delete row.id;
        opts.remapFks?.(row, idMaps);
        const created = await opts.model(db).create({ data: row });
        idMaps[opts.key]!.set(oldId, created.id);
      }
    },
    count: (db, companyId) => opts.model(db).count({ where: companyWhere(companyId) }),
    clear: (db, companyId) => opts.model(db).deleteMany({ where: companyWhere(companyId) }),
  };
}

/** Register all backup sources. Idempotent — safe to call in every worker. */
export function registerBackupSources(): void {
  if (dataSourceRegistry.isFrozen()) return;

  const sources: DataSource[] = [
    simpleSource({
      key: "project-groups",
      displayName: "Project Groups",
      group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"],
       
      model: (db: any) => db.projectGroup,
      remapFks: (row, idMaps) => { row.ownerId = remap(idMaps, "users", row.ownerId); },
    }),
    childSource({
      key: "projects",
      displayName: "Projects",
      group: BACKUP_GROUP.PROJECTS,
      dependsOn: ["project-groups", "users"],
       
      model: (db: any) => db.project,
      parentRelation: "group",
      remapFks: (row, idMaps) => {
        row.groupId = remap(idMaps, "project-groups", row.groupId);
        row.ownerId = remap(idMaps, "users", row.ownerId);
      },
    }),
    childSource({
      key: "project-members",
      displayName: "Project Members",
      group: BACKUP_GROUP.PROJECTS,
      dependsOn: ["projects", "users"],
       
      model: (db: any) => db.projectMember,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        row.userId = remap(idMaps, "users", row.userId);
      },
    }),
    childSource({
      key: "task-lists",
      displayName: "Task Lists",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["projects"],
       
      model: (db: any) => db.taskList,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
      },
    }),
    childSource({
      key: "tasks",
      displayName: "Tasks",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["projects", "task-lists", "users", "custom-statuses"],
       
      model: (db: any) => db.task,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        row.listId = remap(idMaps, "task-lists", row.listId);
        if (row.parentId) row.parentId = remap(idMaps, "tasks", row.parentId);
        row.createdById = remap(idMaps, "users", row.createdById);
        if (row.customStatusId) row.customStatusId = remap(idMaps, "custom-statuses", row.customStatusId);
      },
    }),
    childSource({
      key: "comments",
      displayName: "Comments",
      group: BACKUP_GROUP.CONTENT,
      dependsOn: ["projects", "users", "tasks", "discussions"],
       
      model: (db: any) => db.comment,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        if (row.itemType === "task") row.itemId = remap(idMaps, "tasks", row.itemId);
        if (row.itemType === "discussion") row.itemId = remap(idMaps, "discussions", row.itemId);
        row.userId = remap(idMaps, "users", row.userId);
      },
    }),
    childSource({
      key: "discussions",
      displayName: "Discussions",
      group: BACKUP_GROUP.CONTENT,
      dependsOn: ["projects", "users"],
       
      model: (db: any) => db.discussion,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        row.createdById = remap(idMaps, "users", row.createdById);
      },
    }),
    childSource({
      key: "file-folders",
      displayName: "File Folders",
      group: BACKUP_GROUP.CONTENT,
      dependsOn: ["projects"],
       
      model: (db: any) => db.fileFolder,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        if (row.parentId) row.parentId = remap(idMaps, "file-folders", row.parentId);
      },
    }),
    childSource({
      key: "files",
      displayName: "Files",
      group: BACKUP_GROUP.CONTENT,
      dependsOn: ["projects", "file-folders", "users", "tasks", "comments"],
       
      model: (db: any) => db.fileRecord,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        if (row.folderId) row.folderId = remap(idMaps, "file-folders", row.folderId);
        row.uploadedById = remap(idMaps, "users", row.uploadedById);
        if (row.itemType === "task") row.itemId = remap(idMaps, "tasks", row.itemId);
        if (row.itemType === "comment") row.itemId = remap(idMaps, "comments", row.itemId);
      },
    }),
    childSource({
      key: "time-records",
      displayName: "Time Records",
      group: BACKUP_GROUP.TRACKING,
      dependsOn: ["projects", "users", "tasks"],
       
      model: (db: any) => db.timeRecord,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        row.userId = remap(idMaps, "users", row.userId);
        if (row.linkItemType === "task") row.linkItemId = remap(idMaps, "tasks", row.linkItemId);
      },
    }),
    childSource({
      key: "calendar-events",
      displayName: "Calendar Events",
      group: BACKUP_GROUP.TRACKING,
      dependsOn: ["projects", "users"],
       
      model: (db: any) => db.calendarEvent,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        row.createdById = remap(idMaps, "users", row.createdById);
      },
    }),
    childSource({
      key: "milestones",
      displayName: "Milestones",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["projects"],
       
      model: (db: any) => db.milestone,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
      },
    }),
    childSource({
      key: "issues",
      displayName: "Issues",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["projects"],
       
      model: (db: any) => db.issue,
      parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
      },
    }),
    simpleSource({
      key: "tags",
      displayName: "Tags",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["users"],
       
      model: (db: any) => db.tag,
      remapFks: (row, idMaps) => { row.ownerId = remap(idMaps, "users", row.ownerId); },
    }),
    {
      key: "task-assignees",
      displayName: "Task Assignees",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["tasks"],
      export: (db, companyId) =>
        db.taskAssignee.findMany({ where: { task: { project: { group: { companyId } } } } }),
      import: async (db, _companyId, rows, idMaps) => {
        for (const raw of rows as AnyRow[]) {
          await db.taskAssignee.create({
            data: { taskId: remap(idMaps, "tasks", raw.taskId) as number, userId: remap(idMaps, "users", raw.userId) as number },
          });
        }
      },
      count: (db, companyId) =>
        db.taskAssignee.count({ where: { task: { project: { group: { companyId } } } } }),
      clear: async (db, companyId) => {
        await db.taskAssignee.deleteMany({ where: { task: { project: { group: { companyId } } } } });
      },
    },
    {
      key: "task-tags",
      displayName: "Task Tags",
      group: BACKUP_GROUP.TASKS,
      dependsOn: ["tasks", "tags"],
      export: (db, companyId) =>
        db.taskTag.findMany({ where: { task: { project: { group: { companyId } } } } }),
      import: async (db, _companyId, rows, idMaps) => {
        for (const raw of rows as AnyRow[]) {
          await db.taskTag.create({
            data: {
              taskId: remap(idMaps, "tasks", raw.taskId) as number,
              tagId: remap(idMaps, "tags", raw.tagId) as number,
            },
          });
        }
      },
      count: (db, companyId) =>
        db.taskTag.count({ where: { task: { project: { group: { companyId } } } } }),
      clear: async (db, companyId) => {
        await db.taskTag.deleteMany({ where: { task: { project: { group: { companyId } } } } });
      },
    },
    {
      key: "applications",
      identityType: "number",
      displayName: "Application Catalog",
      group: BACKUP_GROUP.WORKSPACE,
      dependsOn: [],
      export: async (db) => db.application.findMany(),
      import: async (db, _companyId, rows, idMaps) => {
        if (!idMaps.applications) idMaps.applications = new Map();
        for (const raw of rows as AnyRow[]) {
          const existing = await db.application.findUnique({ where: { appKey: raw.appKey }, select: { id: true } });
          const app = existing ?? await db.application.create({
            data: { appKey: raw.appKey, title: raw.title, singularName: raw.singularName, kind: raw.kind, viewType: raw.viewType },
          });
          idMaps.applications.set(raw.id, app.id);
        }
      },
      count: async (db) => db.application.count(),
      clear: async () => undefined, // global catalog is never cleared
    },
    {
      key: "users",
      identityType: "number",
      displayName: "Users",
      group: BACKUP_GROUP.WORKSPACE,
      dependsOn: [],
      export: async (db, companyId) =>
        db.user.findMany({
          where: { userCompanyRoles: { some: { companyId } } },
          select: { id: true, email: true, fullName: true, emailVerified: true, createdAt: true, updatedAt: true },
        }),
      import: async (db, _companyId, rows, idMaps) => {
        if (!idMaps.users) idMaps.users = new Map();
        for (const raw of rows as AnyRow[]) {
          const existing = await db.user.findUnique({ where: { email: raw.email }, select: { id: true } });
          if (existing) { idMaps.users.set(raw.id, existing.id); continue; }
          const created = await db.user.create({
            data: { email: raw.email, fullName: raw.fullName, emailVerified: raw.emailVerified ?? false },
          });
          idMaps.users.set(raw.id, created.id);
        }
      },
      count: async (db, companyId) => db.user.count({ where: { userCompanyRoles: { some: { companyId } } } }),
      clear: async () => undefined, // users are never deleted by restore
    },
    simpleSource({
      key: "user-company-roles", displayName: "Memberships", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.userCompanyRole,
      remapFks: (row, idMaps) => { row.userId = remap(idMaps, "users", row.userId); },
    }),
    childSource({
      key: "group-members", displayName: "Group Members", group: BACKUP_GROUP.PROJECTS,
      dependsOn: ["project-groups", "users"], model: (db: any) => db.groupMember, parentRelation: "group",
      remapFks: (row, idMaps) => {
        row.groupId = remap(idMaps, "project-groups", row.groupId);
        row.userId = remap(idMaps, "users", row.userId);
      },
    }),
    childSource({
      key: "project-applications", displayName: "Project Apps", group: BACKUP_GROUP.PROJECTS,
      dependsOn: ["projects"], model: (db: any) => db.projectApplication, parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => { row.projectId = remap(idMaps, "projects", row.projectId); row.applicationId = remap(idMaps, "applications", row.applicationId); },
    }),
    childSource({
      key: "group-applications", displayName: "Group Apps", group: BACKUP_GROUP.PROJECTS,
      dependsOn: ["project-groups"], model: (db: any) => db.groupApplication, parentRelation: "group",
      remapFks: (row, idMaps) => { row.groupId = remap(idMaps, "project-groups", row.groupId); row.applicationId = remap(idMaps, "applications", row.applicationId); },
    }),
    simpleSource({
      key: "custom-statuses", displayName: "Custom Statuses", group: BACKUP_GROUP.TASKS,
      dependsOn: [], model: (db: any) => db.customStatus,
    }),
    simpleSource({
      key: "chat-messages", displayName: "Chat Messages", group: BACKUP_GROUP.CONTENT,
      dependsOn: ["users"], model: (db: any) => db.chatMessage,
      remapFks: (row, idMaps) => { row.userId = remap(idMaps, "users", row.userId); },
    }),
    simpleSource({
      key: "notifications", displayName: "Notifications", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.notification,
      remapFks: (row, idMaps) => { row.userId = remap(idMaps, "users", row.userId); },
    }),
    simpleSource({
      key: "pending-approvals", displayName: "Pending Approvals", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.pendingApproval,
      remapFks: (row, idMaps) => {
        row.submittedBy = remap(idMaps, "users", row.submittedBy);
        if (row.reviewedBy) row.reviewedBy = remap(idMaps, "users", row.reviewedBy);
      },
    }),
    simpleSource({
      key: "permission-templates", displayName: "Permission Templates", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: [], model: (db: any) => db.permissionTemplate,
    }),
    childSource({
      key: "permission-template-pages", displayName: "Template Pages", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["permission-templates"], model: (db: any) => db.permissionTemplatePage, parentRelation: "template",
      remapFks: (row, idMaps) => { row.templateId = remap(idMaps, "permission-templates", row.templateId); },
    }),
    simpleSource({
      key: "permission-assignments", displayName: "Permission Assignments", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users", "permission-templates"], model: (db: any) => db.userPermissionAssignment,
      remapFks: (row, idMaps) => {
        row.userId = remap(idMaps, "users", row.userId);
        row.templateId = remap(idMaps, "permission-templates", row.templateId);
        row.assignedBy = remap(idMaps, "users", row.assignedBy);
      },
    }),
    simpleSource({
      key: "permission-overrides", displayName: "Permission Overrides", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.userPermissionOverride,
      remapFks: (row, idMaps) => {
        row.userId = remap(idMaps, "users", row.userId);
        row.setBy = remap(idMaps, "users", row.setBy);
      },
    }),
    simpleSource({
      key: "permission-audit", displayName: "Permission Audit", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.permissionAuditLog,
      remapFks: (row, idMaps) => {
        row.actorId = remap(idMaps, "users", row.actorId);
        if (row.targetUserId) row.targetUserId = remap(idMaps, "users", row.targetUserId);
      },
    }),
    simpleSource({
      key: "invitations", displayName: "Invitations", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.invitation,
      remapFks: (row, idMaps) => { row.invitedBy = remap(idMaps, "users", row.invitedBy); },
    }),
    simpleSource({
      key: "email-alert-prefs", displayName: "Email Alert Preferences", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.emailAlertPreference,
      remapFks: (row, idMaps) => { row.userId = remap(idMaps, "users", row.userId); },
    }),
    simpleSource({
      key: "email-alerts", displayName: "Email Alerts", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.emailAlert,
      remapFks: (row, idMaps) => { row.userId = remap(idMaps, "users", row.userId); },
    }),
    simpleSource({
      key: "backup-schedules", displayName: "Backup Schedules", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: [], model: (db: any) => db.backupSchedule,
    }),
    childSource({
      key: "project-documents", displayName: "Project Documents", group: BACKUP_GROUP.CONTENT,
      dependsOn: ["projects", "users"], model: (db: any) => db.projectDocument, parentRelation: "project",
      companyWhere: (companyId) => ({ project: { is: { group: { is: { companyId } } } } }),
      remapFks: (row, idMaps) => {
        row.projectId = remap(idMaps, "projects", row.projectId);
        row.createdById = remap(idMaps, "users", row.createdById);
        if (row.updatedById) row.updatedById = remap(idMaps, "users", row.updatedById);
      },
    }),
    simpleSource({
      key: "audit-logs", displayName: "Audit Logs", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.auditLog,
      remapFks: (row, idMaps) => { row.userId = remap(idMaps, "users", row.userId); },
    }),
    simpleSource({
      key: "deletion-audits", displayName: "Deletion Audits", group: BACKUP_GROUP.WORKSPACE,
      dependsOn: ["users"], model: (db: any) => db.deletionAudit,
      remapFks: (row, idMaps) => { row.actorId = remap(idMaps, "users", row.actorId); },
    }),
  ];

  for (const source of sources) dataSourceRegistry.register(source);
  dataSourceRegistry.freeze();
}
