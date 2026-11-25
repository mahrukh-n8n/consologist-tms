import type { PrismaClient } from "@/generated/prisma/client";
import { gkCreateTask, gkSetTaskArchived, gkBulkUpdateTasks, gkUpdateTaskStatus } from "@/lib/mutations/tasks";
import { gkCreateComment } from "@/lib/mutations/comments";
import { notifyTaskComment } from "@/lib/notifications/email-alerts";
import { createNotification } from "@/lib/notifications/service";
import { createWorkspaceBackup, executeWorkspaceRestore, deleteWorkspaceBackup } from "@/lib/backup/backup-service";
import { registerBackupSources } from "@/lib/backup/register-sources";
import { inviteWorkspaceUser, revokeWorkspaceInvitation } from "@/lib/users/membership";
import { updateAlertPreferences } from "@/lib/account/alert-preferences";
import type { CreateTaskInput, UpdateTaskStatusInput, AddCommentInput } from "@/lib/tasks/schema";
import { deleteCommentWithAudit, deleteTaskWithAudit } from "@/lib/audit/delete-with-audit";
import { MAX_UPLOAD_BYTES, uploadTaskFile } from "@/lib/files/service";
import { gkDeleteTaskFile } from "@/lib/mutations/task-files";
import { gkCreateCustomStatus, archiveCustomStatus } from "@/lib/tasks/custom-statuses";
import { pauseSchedule, upsertSchedule } from "@/lib/backup/schedule";
import { gkCreateGroup, gkCreateProject } from "@/lib/projects/service";
import { gkAddProjectMember, gkRemoveProjectMember } from "@/lib/projects/members";
import { gkCreateDiscussion } from "@/lib/discussions/service";
import { gkCreateEvent } from "@/lib/calendar/service";
import { gkCreateTimeRecord } from "@/lib/time/service";
import { gkSendChat } from "@/lib/chat/service";
import { attachTags, deleteTag, detachTag, renameTag } from "@/lib/tasks/tags";
import { assignTemplate } from "@/modules/auth-rbac/services/assignment-service";
import { uploadWorkspaceFile } from "@/lib/files/service";
import { markAllAsRead } from "@/lib/notifications/service";
import { gkUpdateTaskDetails } from "@/lib/mutations/tasks";
import { deleteDocumentWithAudit, gkAddDocumentAttachment, gkCreateDocument, gkDeleteDocumentAttachment, gkUpdateDocument } from "@/lib/mutations/documents";
import { archiveTaskList, deleteTaskListWithAudit, gkCreateTaskList, renameTaskList } from "@/lib/tasks/lists";

type Db = PrismaClient;

export type ApprovalExecution = { entityId: number | null; result?: unknown };

type Handler = (
  db: Db,
  payload: Record<string, unknown>,
  submitterId: number,
  companyId: number
) => Promise<ApprovalExecution>;

async function executeTaskCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const task = await db.$transaction((tx) =>
    gkCreateTask(tx, companyId, submitterId, payload as unknown as CreateTaskInput)
  );
  await createNotification({
    companyId,
    userId: submitterId,
    title: "Task created",
    message: task.title,
    type: "success",
  });
  return { entityId: task.id, result: { taskId: task.id } };
}

async function executeComment(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const comment = await db.$transaction((tx) =>
    gkCreateComment(tx, companyId, submitterId, payload as unknown as AddCommentInput)
  );
  await notifyTaskComment(db, comment.id);
  return { entityId: comment.id, result: { commentId: comment.id } };
}

async function executeStatus(db: Db, payload: Record<string, unknown>, _submitterId: number, companyId: number) {
  const task = await db.$transaction((tx) =>
    gkUpdateTaskStatus(tx, companyId, _submitterId, payload as unknown as UpdateTaskStatusInput)
  );
  return { entityId: task.id, result: { taskId: task.id, status: task.status } };
}

async function executeInvite(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const submitter = await db.user.findUnique({ where: { id: submitterId }, select: { fullName: true } });
  const invitation = await inviteWorkspaceUser(db, {
    companyId,
    inviterId: submitterId,
    inviterName: submitter?.fullName ?? "A teammate",
    email: String(payload["email"] ?? ""),
    role: payload["role"] as never,
  });
  return { entityId: invitation.id, result: { invitationId: invitation.id } };
}

async function executeRevokeInvite(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  await revokeWorkspaceInvitation(db, {
    companyId,
    invitationId: Number(payload["invitationId"]),
  });
  return { entityId: null };
}

async function executeBackupCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  registerBackupSources();
  const result = await createWorkspaceBackup(db, {
    companyId,
    userId: submitterId,
    password: String(payload["password"] ?? ""),
  });
  return { entityId: result.backupId, result };
}

async function executeBackupRestore(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  registerBackupSources();
  const result = await executeWorkspaceRestore(db, {
    companyId,
    userId: submitterId,
    backupId: Number(payload["backupId"]),
    password: String(payload["password"] ?? ""),
  });
  return { entityId: null, result };
}

async function executeBackupDelete(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  registerBackupSources();
  await deleteWorkspaceBackup(db, { companyId, backupId: Number(payload["backupId"]) });
  return { entityId: null };
}

async function executeAlertPrefs(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  await updateAlertPreferences(db, {
    userId: submitterId,
    companyId,
    dueSoon: Boolean(payload["dueSoon"]),
    overdue: Boolean(payload["overdue"]),
    comment: Boolean(payload["comment"]),
    mention: Boolean(payload["mention"]),
  });
  return { entityId: null };
}

async function executeTaskDelete(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const audit = await deleteTaskWithAudit(db, { companyId, actorId: submitterId, taskId: Number(payload["taskId"]), reason: String(payload["reason"] ?? "") });
  return { entityId: null, result: { deletionAuditId: audit.id } };
}
async function executeGroupCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const group = await gkCreateGroup(db, companyId, submitterId, String(payload["name"] ?? ""));
  return { entityId: group.id, result: group };
}
async function executeProjectCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const project = await gkCreateProject(db, companyId, submitterId, payload as never);
  return { entityId: project.id, result: project };
}
async function executeDiscussionCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const discussion = await gkCreateDiscussion(db, companyId, submitterId, payload as never);
  return { entityId: discussion.id, result: discussion };
}
async function executeEventCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const event = await gkCreateEvent(db, companyId, submitterId, payload as never);
  return { entityId: event.id, result: event };
}
async function executeTimeCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const record = await gkCreateTimeRecord(db, companyId, submitterId, payload as never);
  return { entityId: record.id, result: record };
}
async function executeChatSend(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const message = await gkSendChat(db, companyId, submitterId, String(payload["body"] ?? ""));
  return { entityId: message.id, result: message };
}
async function executeTagRename(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  await renameTag(db, companyId, Number(payload["tagId"]), String(payload["title"] ?? ""));
  return { entityId: null };
}
async function executeTagDelete(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  await deleteTag(db, companyId, Number(payload["tagId"]));
  return { entityId: null };
}
async function executeTagAttach(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  await attachTags(db, companyId, submitterId, Number(payload["taskId"]), (payload["titles"] as string[]) ?? []);
  return { entityId: null };
}
async function executeTagDetach(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  await detachTag(db, companyId, Number(payload["taskId"]), Number(payload["tagId"]));
  return { entityId: null };
}
async function executeAssignTemplate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  await assignTemplate(db, { userId: Number(payload["userId"]), companyId, templateId: Number(payload["templateId"]), assignedBy: submitterId });
  return { entityId: null };
}
async function executeFileUpload(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const file = await uploadWorkspaceFile(db, companyId, submitterId, {
    projectId: Number(payload["projectId"]),
    name: String(payload["name"] ?? "file"),
    mimeType: String(payload["mimeType"] ?? "application/octet-stream"),
    bytes: Buffer.from(String(payload["base64"] ?? ""), "base64"),
  });
  return { entityId: file.id, result: file };
}
async function executeDocumentCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const doc = await gkCreateDocument(db, companyId, submitterId, payload as never);
  return { entityId: doc.id, result: doc };
}
async function executeDocumentUpdate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const doc = await gkUpdateDocument(db, companyId, submitterId, payload as never);
  return { entityId: doc.id, result: doc };
}
async function executeDocumentDelete(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const audit = await deleteDocumentWithAudit(db, { companyId, actorId: submitterId, documentId: Number(payload["documentId"]), reason: String(payload["reason"] ?? "") });
  return { entityId: null, result: { deletionAuditId: audit.id } };
}
async function executeDocumentAttachment(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const attachment = await gkAddDocumentAttachment(db, companyId, submitterId, payload as never);
  return { entityId: attachment.id, result: attachment };
}
async function executeDocumentAttachmentDelete(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  await gkDeleteDocumentAttachment(db, companyId, submitterId, Number(payload["attachmentId"]));
  return { entityId: null };
}
async function executeTaskUpdate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const task = await db.$transaction((tx) => gkUpdateTaskDetails(tx, companyId, submitterId, payload as never));
  return { entityId: task.id, result: task };
}
async function executeTaskListCreate(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const list = await gkCreateTaskList(db, companyId, submitterId, payload as never);
  return { entityId: list.id, result: list };
}
async function executeTaskListRename(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  const list = await renameTaskList(db, companyId, payload as never);
  return { entityId: list.id, result: list };
}
async function executeTaskListArchive(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  const list = await archiveTaskList(db, companyId, payload as never);
  return { entityId: list.id, result: list };
}
async function executeMarkRead(db: Db, _payload: Record<string, unknown>, submitterId: number, companyId: number) {
  await markAllAsRead(submitterId, companyId);
  return { entityId: null };
}

async function executeCommentDelete(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const audit = await deleteCommentWithAudit(db, {
    companyId,
    actorId: submitterId,
    commentId: Number(payload["commentId"]),
    reason: String(payload["reason"] ?? ""),
  });
  return { entityId: null, result: { deletionAuditId: audit.id } };
}

async function executeTaskFileUpload(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const bytes = Buffer.from(String(payload["base64"] ?? ""), "base64");
  if (bytes.length === 0) throw new Error("Empty file.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("Files are limited to 10 MB.");
  const file = await uploadTaskFile(db, companyId, submitterId, {
    taskId: Number(payload["taskId"]),
    name: String(payload["name"] ?? ""),
    mimeType: String(payload["mimeType"] ?? "application/octet-stream"),
    bytes,
  });
  return { entityId: file.id, result: file };
}

async function executeTaskFileRemove(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const result = await gkDeleteTaskFile(db, companyId, submitterId, Number(payload["fileId"]));
  return { entityId: result.id };
}

async function executeAddProjectMember(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const result = await gkAddProjectMember(db, companyId, submitterId, payload as never);
  return { entityId: result.id, result };
}

async function executeRemoveProjectMember(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const result = await gkRemoveProjectMember(db, companyId, submitterId, payload as never);
  return { entityId: result.id };
}

async function executeTaskArchive(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const result = await db.$transaction((tx) => gkSetTaskArchived(tx, companyId, submitterId, payload as never));
  return { entityId: Number(payload["taskId"]), result };
}

async function executeTaskBulk(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const result = await db.$transaction((tx) => gkBulkUpdateTasks(tx, companyId, submitterId, payload as never));
  return { entityId: null, result };
}

async function executeTaskListDelete(db: Db, payload: Record<string, unknown>, submitterId: number, companyId: number) {
  const audit = await deleteTaskListWithAudit(db, {
    companyId,
    actorId: submitterId,
    listId: Number(payload["listId"]),
    reason: String(payload["reason"] ?? ""),
  });
  return { entityId: null, result: { deletionAuditId: audit.id } };
}

async function executeCustomStatusCreate(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  const status = await gkCreateCustomStatus(db, companyId, payload as never);
  return { entityId: status.id, result: status };
}

async function executeCustomStatusArchive(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  await archiveCustomStatus(db, companyId, Number(payload["statusId"]));
  return { entityId: null };
}

async function executeBackupScheduleSave(db: Db, payload: Record<string, unknown>, _s: number, companyId: number) {
  const schedule = await upsertSchedule(db, companyId, payload as never);
  return { entityId: schedule.id, result: schedule };
}

async function executeBackupSchedulePause(db: Db, _payload: Record<string, unknown>, _s: number, companyId: number) {
  await pauseSchedule(db, companyId);
  return { entityId: null };
}

const HANDLERS: Record<string, Handler> = {
  Task: executeTaskCreate,
  "tasks.create": executeTaskCreate,
  Comment: executeComment,
  "tasks.comment": executeComment,
  TaskStatus: executeStatus,
  "tasks.update_status": executeStatus,
  "users.invite": executeInvite,
  "users.revoke_invitation": executeRevokeInvite,
  "backups.create": executeBackupCreate,
  "backups.restore": executeBackupRestore,
  "backups.delete": executeBackupDelete,
  "account.update_alert_prefs": executeAlertPrefs,
  "tasks.delete": executeTaskDelete,
  "projects.create_group": executeGroupCreate,
  "projects.create_project": executeProjectCreate,
  "discussions.create": executeDiscussionCreate,
  "calendar.create": executeEventCreate,
  "time.create": executeTimeCreate,
  "chat.send": executeChatSend,
  "tags.rename": executeTagRename,
  "tags.delete": executeTagDelete,
  "tags.attach": executeTagAttach,
  "tags.detach": executeTagDetach,
  "permissions.assign_template": executeAssignTemplate,
  "files.upload": executeFileUpload,
  "notifications.mark_read": executeMarkRead,
  TaskList: executeTaskListCreate,
  "tasks.update": executeTaskUpdate,
  "task_lists.create": executeTaskListCreate,
  "task_lists.rename": executeTaskListRename,
  "task_lists.archive": executeTaskListArchive,
  ProjectDocument: executeDocumentCreate,
  "documents.create": executeDocumentCreate,
  "documents.update": executeDocumentUpdate,
  "documents.delete": executeDocumentDelete,
  "documents.add_attachment": executeDocumentAttachment,
  "documents.delete_attachment": executeDocumentAttachmentDelete,
  "tasks.delete_comment": executeCommentDelete,
  "tasks.attach_file": executeTaskFileUpload,
  "tasks.remove_file": executeTaskFileRemove,
  "statuses.create": executeCustomStatusCreate,
  "statuses.archive": executeCustomStatusArchive,
  "backups.save_schedule": executeBackupScheduleSave,
  "backups.pause_schedule": executeBackupSchedulePause,
  "projects.add_member": executeAddProjectMember,
  "projects.remove_member": executeRemoveProjectMember,
  "tasks.archive": executeTaskArchive,
  "tasks.bulk": executeTaskBulk,
  "task_lists.delete": executeTaskListDelete,
};

export function approvalHandler(entityType: string): Handler | null {
  return HANDLERS[entityType] ?? null;
}

export const APPROVAL_ENTITY_TYPES = Object.keys(HANDLERS);
