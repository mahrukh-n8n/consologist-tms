"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageAccess, requirePageWrite, requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { TASK_INCLUDE, presentTask } from "@/lib/tasks/query";
import { listTaskFiles } from "@/lib/files/service";
import { isConnected } from "@/modules/google-drive";
import { assertProjectMember } from "@/lib/projects/access";
import { deleteSavedFilter, deleteSavedFilterSchema, saveSavedFilter, saveSavedFilterSchema } from "@/lib/tasks/saved-filters";
import {
  archiveTaskList,
  archiveTaskListSchema,
  deleteTaskListSchema,
  deleteTaskListWithAudit,
  createTaskListSchema,
  gkCreateTaskList,
  renameTaskList,
  renameTaskListSchema,
} from "@/lib/tasks/lists";
import { gkCreateTask, gkSetTaskArchived, gkBulkUpdateTasks, gkUpdateTaskDetails } from "@/lib/mutations/tasks";
import { archiveTaskSchema, bulkTaskActionSchema, createTaskSchema, updateTaskStatusSchema, addCommentSchema, updateTaskDetailsSchema } from "@/lib/tasks/schema";
import { gkUpdateTaskStatus } from "@/lib/mutations/tasks";
import { createTaskComment } from "@/lib/tasks/comments";
import { deleteTaskWithAudit } from "@/lib/audit/delete-with-audit";
import { createNotification } from "@/lib/notifications/service";

export type TaskActionState = { success: boolean; error?: string; approvalRequired?: boolean };

export async function createTaskAction(
  _prev: TaskActionState,
  formData: FormData
): Promise<TaskActionState> {
  const { user, company } = await requireCompany();
  const gate = await requireWriteGate(user.id, company.id, "tasks");

  const parsed = createTaskSchema.safeParse({
    projectId: formData.get("projectId"),
    listId: formData.get("listId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "NO_PROGRESS",
    priority: formData.get("priority") ?? "NONE",
    quadrant: formData.get("quadrant") || undefined,
    dueAt: formData.get("dueAt") ? new Date(String(formData.get("dueAt"))).toISOString() : undefined,
    assigneeIds: formData.getAll("assigneeIds").map(String),
    tags: String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    customStatusId: formData.get("customStatusId") || undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  if (gate.needsApproval) {
    await prisma.pendingApproval.create({
      data: {
        companyId: company.id,
        entityType: "Task",
        pageKey: "tasks",
        payload: parsed.data,
        displayPayload: { title: parsed.data.title },
        submittedBy: user.id,
      },
    });
    return { success: true, approvalRequired: true };
  }

  try {
    const task = await prisma.$transaction((tx) =>
      gkCreateTask(tx, company.id, user.id, parsed.data)
    );
    await createNotification({
      companyId: company.id,
      userId: user.id,
      title: "Task created",
      message: task.title,
      type: "success",
    });
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "The task could not be created.",
    };
  }
}


export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requireWriteGate(user.id, company.id, "tasks");
  const parsed = updateTaskStatusSchema.safeParse({
    taskId: formData.get("taskId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;
  await prisma.$transaction((tx) => gkUpdateTaskStatus(tx, company.id, user.id, parsed.data));
  revalidatePath("/tasks");
}

export async function addTaskCommentAction(
  _prev: { success: boolean; error?: string },
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const { user, company } = await requireCompany();
  const gate = await requireWriteGate(user.id, company.id, "tasks");
  const parsed = addCommentSchema.safeParse({
    taskId: formData.get("taskId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid comment." };

  if (gate.needsApproval) {
    await prisma.pendingApproval.create({
      data: {
        companyId: company.id,
        entityType: "Comment",
        pageKey: "tasks",
        payload: parsed.data,
        submittedBy: user.id,
      },
    });
    return { success: true };
  }

  try {
    await createTaskComment(prisma, company.id, user.id, parsed.data);
    revalidatePath(`/tasks/${parsed.data.taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Comment failed." };
  }
}


export type ListActionState = { success: boolean; error?: string };

export async function createTaskListAction(_prev: ListActionState, formData: FormData): Promise<ListActionState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "tasks");
    const parsed = createTaskListSchema.safeParse({ projectId: formData.get("projectId"), name: formData.get("name") });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid list." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "TaskList", pageKey: "tasks", payload: parsed.data, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkCreateTaskList(prisma, company.id, user.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "List creation failed." }; }
}

export async function renameTaskListAction(_prev: ListActionState, formData: FormData): Promise<ListActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const parsed = renameTaskListSchema.safeParse({ listId: formData.get("listId"), name: formData.get("name") });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid list." };
    await renameTaskList(prisma, company.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Rename failed." }; }
}

export async function archiveTaskListAction(_prev: ListActionState, formData: FormData): Promise<ListActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const parsed = archiveTaskListSchema.safeParse({ listId: formData.get("listId") });
    if (!parsed.success) return { success: false, error: "Invalid list." };
    await archiveTaskList(prisma, company.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Archive failed." }; }
}


export async function updateTaskDetailsAction(_prev: TaskActionState, formData: FormData): Promise<TaskActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const parsed = updateTaskDetailsSchema.safeParse({
      taskId: formData.get("taskId"),
      projectId: formData.get("projectId"),
      listId: formData.get("listId"),
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      status: formData.get("status"),
      priority: formData.get("priority"),
      quadrant: formData.get("quadrant") || undefined,
      parentId: formData.has("parentId") ? (String(formData.get("parentId")) || null) : undefined,
      progress: formData.get("progress"),
      dueAt: String(formData.get("dueAt") ?? "") || undefined,
      customStatusId: String(formData.get("customStatusId") ?? "") || undefined,
      assigneeIds: formData.getAll("assigneeIds").map(String),
      tags: String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
    await prisma.$transaction((tx) => gkUpdateTaskDetails(tx, company.id, user.id, parsed.data));
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${parsed.data.taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Save failed." };
  }
}


export type InlinePatch = {
  title?: string;
  status?: string;
  priority?: string;
  quadrant?: string | null;
  dueAt?: string | null;
  progress?: number;
  customStatusId?: number | null;
  assigneeIds?: number[];
  tags?: string[];
  projectId?: number;
  listId?: number;
};

export async function updateTaskInlineAction(
  _prev: TaskActionState,
  formData: FormData
): Promise<TaskActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const taskId = Number(formData.get("taskId"));
    if (!Number.isInteger(taskId) || taskId <= 0) return { success: false, error: "Invalid task." };

    let patch: InlinePatch;
    try {
      patch = JSON.parse(String(formData.get("patch") ?? "{}")) as InlinePatch;
    } catch {
      return { success: false, error: "Invalid edit." };
    }

    const current = await prisma.task.findFirst({
      where: { id: taskId, project: { group: { companyId: company.id } } },
      include: {
        assignees: { select: { userId: true } },
        tags: { select: { tag: { select: { title: true } } } },
      },
    });
    if (!current) return { success: false, error: "Task not found in this workspace." };

    const parsed = updateTaskDetailsSchema.safeParse({
      taskId,
      projectId: patch.projectId ?? current.projectId,
      listId: patch.listId ?? current.listId,
      title: patch.title ?? current.title,
      description: current.description,
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      quadrant: patch.quadrant === undefined ? (current.quadrant ?? undefined) : (patch.quadrant ?? undefined),
      progress: patch.progress ?? current.progress,
      dueAt: patch.dueAt === undefined ? (current.dueAt ? current.dueAt.toISOString() : undefined) : (patch.dueAt ?? undefined),
      customStatusId: patch.customStatusId === undefined ? (current.customStatusId ?? undefined) : (patch.customStatusId ?? undefined),
      assigneeIds: patch.assigneeIds ?? current.assignees.map((row) => row.userId),
      tags: patch.tags ?? current.tags.map((row) => row.tag.title),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };

    await prisma.$transaction((tx) => gkUpdateTaskDetails(tx, company.id, user.id, parsed.data));
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Update failed." };
  }
}

export type TaskDrawerData = {
  task: {
    id: number;
    projectId: number;
    listId: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    quadrant: string | null;
    dueAt: string | null;
    progress: number;
    customStatusId: number | null;
    assigneeIds: number[];
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
  comments: { id: number; body: string; authorName: string; createdAt: string }[];
  files: { id: number; name: string; mimeType: string; size: number; webViewLink: string; createdAt: string }[];
  driveConnected: boolean;
};

/** Load everything the task drawer shows. Read-only; scoped to the active workspace. */
export async function getTaskDrawerDataAction(taskId: number): Promise<TaskDrawerData> {
  const { user, company } = await requireCompany();
  await requirePageAccess(user.id, company.id, "tasks");
  if (!Number.isInteger(taskId) || taskId <= 0) throw new Error("Invalid task.");

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { group: { companyId: company.id } } },
    include: TASK_INCLUDE,
  });
  if (!task) throw new Error("Task not found in this workspace.");
  await assertProjectMember(prisma, company.id, user.id, task.projectId);

  const [comments, files, driveConnected] = await Promise.all([
    prisma.comment.findMany({
      where: { itemType: "task", itemId: taskId, projectId: task.projectId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listTaskFiles(prisma, company.id, taskId),
    isConnected(prisma, company.id),
  ]);

  const row = presentTask(task);
  return {
    task: {
      id: row.id,
      projectId: task.projectId,
      listId: task.listId,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      quadrant: row.quadrant,
      dueAt: row.dueAt,
      progress: task.progress,
      customStatusId: row.customStatusId,
      assigneeIds: row.assignees.map((assignee) => assignee.id),
      tags: row.tags.map((tag) => tag.title),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    },
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorName: comment.user.fullName,
      createdAt: comment.createdAt.toISOString(),
    })),
    files: files.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
    driveConnected,
  };
}

export type BulkActionState = { success: boolean; error?: string; updated?: number };

/** Archive / unarchive / move one or many tasks (drag-drop and selection bar). */
export async function bulkTaskAction(_prev: BulkActionState, formData: FormData): Promise<BulkActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    let payload: unknown;
    try {
      payload = JSON.parse(String(formData.get("payload") ?? "{}"));
    } catch {
      return { success: false, error: "Invalid bulk request." };
    }
    const parsed = bulkTaskActionSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid bulk request." };
    const result = await prisma.$transaction((tx) => gkBulkUpdateTasks(tx, company.id, user.id, parsed.data));
    revalidatePath("/tasks");
    return { success: true, updated: result.updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Bulk action failed." };
  }
}

export async function setTaskArchivedAction(_prev: BulkActionState, formData: FormData): Promise<BulkActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const parsed = archiveTaskSchema.safeParse({
      taskId: formData.get("taskId"),
      archived: formData.get("archived") ?? "true",
    });
    if (!parsed.success) return { success: false, error: "Invalid task." };
    const result = await prisma.$transaction((tx) => gkSetTaskArchived(tx, company.id, user.id, parsed.data));
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${parsed.data.taskId}`);
    return { success: true, updated: result.updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Archive failed." };
  }
}

export async function deleteTaskListAction(_prev: BulkActionState, formData: FormData): Promise<BulkActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const parsed = deleteTaskListSchema.safeParse({
      listId: formData.get("listId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "A deletion reason is required." };
    await deleteTaskListWithAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      listId: parsed.data.listId,
      reason: parsed.data.reason,
    });
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "List deletion failed." };
  }
}

export type SavedFilterState = { success: boolean; error?: string };

export async function saveTaskFilterAction(_prev: SavedFilterState, formData: FormData): Promise<SavedFilterState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageAccess(user.id, company.id, "tasks");
    const parsed = saveSavedFilterSchema.safeParse({
      title: formData.get("title"),
      filter: JSON.parse(String(formData.get("filter") ?? "{}")),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid filter." };
    await saveSavedFilter(prisma, user.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Filter not saved." };
  }
}

export async function deleteSavedFilterAction(formData: FormData): Promise<void> {
  const { user } = await requireCompany();
  const parsed = deleteSavedFilterSchema.safeParse({ savedFilterId: formData.get("savedFilterId") });
  if (!parsed.success) return;
  await deleteSavedFilter(prisma, user.id, parsed.data.savedFilterId);
  revalidatePath("/tasks");
}
export async function bulkDeleteTasksAction(_prev: BulkActionState, formData: FormData): Promise<BulkActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { success: false, error: "A deletion reason is required." };
    let taskIds: unknown;
    try {
      taskIds = JSON.parse(String(formData.get("taskIds") ?? "[]"));
    } catch {
      return { success: false, error: "Invalid selection." };
    }
    const parsed = z.array(z.coerce.number().int().positive()).min(1).max(500).safeParse(taskIds);
    if (!parsed.success) return { success: false, error: "Invalid selection." };
    for (const taskId of parsed.data) {
      await deleteTaskWithAudit(prisma, { companyId: company.id, actorId: user.id, taskId, reason });
    }
    revalidatePath("/tasks");
    return { success: true, updated: parsed.data.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Bulk delete failed." };
  }
}

export async function setTaskListArchivedAction(_prev: BulkActionState, formData: FormData): Promise<BulkActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const parsed = archiveTaskListSchema.safeParse({
      listId: formData.get("listId"),
      archived: formData.get("archived") ?? "true",
    });
    if (!parsed.success) return { success: false, error: "Invalid task list." };
    await archiveTaskList(prisma, company.id, parsed.data);
    revalidatePath("/tasks");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "List archive failed." };
  }
}
