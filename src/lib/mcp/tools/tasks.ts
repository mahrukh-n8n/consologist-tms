import type { McpToolDefinition } from "@/lib/mcp/types";
import {
  addCommentSchema,
  archiveTaskSchema,
  bulkTaskActionSchema,
  createTaskSchema,
  listTasksSchema,
  updateTaskDetailsSchema,
  updateTaskStatusSchema,
} from "@/lib/tasks/schema";
import { buildTaskWhere, presentTask, TASK_INCLUDE } from "@/lib/tasks/query";
import { gkCreateTask, gkSetTaskArchived, gkBulkUpdateTasks, gkUpdateTaskDetails, gkUpdateTaskStatus } from "@/lib/mutations/tasks";
import { createTaskComment } from "@/lib/tasks/comments";
import { createNotification } from "@/lib/notifications/service";
import { canSeeAllProjects } from "@/lib/projects/access";
import { deleteCommentWithAudit, deleteTaskWithAudit } from "@/lib/audit/delete-with-audit";
import { z } from "zod";
import {
  archiveTaskList,
  archiveTaskListSchema,
  deleteTaskListSchema,
  deleteTaskListWithAudit,
  createTaskListSchema,
  gkCreateTaskList,
  listTaskLists,
  renameTaskList,
  renameTaskListSchema,
} from "@/lib/tasks/lists";
import { dataResult, commitResult } from "@/modules/mcp/utils/serialize";
import type {
  AddCommentInput,
  CreateTaskInput,
  ListTasksInput,
  UpdateTaskStatusInput,
} from "@/lib/tasks/schema";

const deleteTaskSchema = z.object({ taskId: z.coerce.number().int().positive(), reason: z.string().trim().min(1).max(500) });
const deleteCommentSchema = z.object({ commentId: z.coerce.number().int().positive(), reason: z.string().trim().min(1).max(500) });

export const taskTools: McpToolDefinition[] = [
  {
    name: "tasks.list",
    description: "List tasks in this workspace, optionally filtered by project, list, status or assignee.",
    inputSchema: listTasksSchema,
    requiredPageKey: "tasks",
    accessLevel: "READ",
    async handler(ctx, input) {
      const query = input as ListTasksInput;
      const seeAll = await canSeeAllProjects(ctx.db, ctx.userId, ctx.companyId);
      const rows = await ctx.db.task.findMany({
        where: buildTaskWhere(ctx.companyId, query, seeAll ? {} : { memberUserId: ctx.userId }),
        include: TASK_INCLUDE,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      return dataResult({ tasks: rows.map(presentTask), page: query.page, pageSize: query.pageSize });
    },
  },
  {
    name: "tasks.create",
    description: "Create a task with multiple assignees, status, priority, due date and create-on-the-go tags.",
    inputSchema: createTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as CreateTaskInput;
      const created = await ctx.db.$transaction((tx) =>
        gkCreateTask(tx, ctx.companyId, ctx.userId, data)
      );
      const task = await ctx.db.task.findUniqueOrThrow({ where: { id: created.id }, include: TASK_INCLUDE });
      await createNotification({
        companyId: ctx.companyId,
        userId: ctx.userId,
        title: "Task created",
        message: task.title,
        type: "success",
      });
      return commitResult(presentTask(task));
    },
  },
  {
    name: "tasks.update",
    description: "Update any task field: title, description, project, list, status, priority, due date, custom status, assignees and tags.",
    inputSchema: updateTaskDetailsSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const updated = await ctx.db.$transaction((tx) =>
        gkUpdateTaskDetails(tx, ctx.companyId, ctx.userId, input as never)
      );
      const task = await ctx.db.task.findUniqueOrThrow({ where: { id: updated.id }, include: TASK_INCLUDE });
      return commitResult(presentTask(task));
    },
  },
  {
    name: "tasks.update_status",
    description: "Update one task's status.",
    inputSchema: updateTaskStatusSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const updated = await ctx.db.$transaction((tx) =>
        gkUpdateTaskStatus(tx, ctx.companyId, ctx.userId, input as UpdateTaskStatusInput)
      );
      const task = await ctx.db.task.findUniqueOrThrow({ where: { id: updated.id }, include: TASK_INCLUDE });
      return commitResult(presentTask(task));
    },
  },
  {
    name: "tasks.comment",
    description: "Add a comment to a task. Assignees receive alerts; @email mentions notify tagged assignees.",
    inputSchema: addCommentSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const comment = await createTaskComment(ctx.db, ctx.companyId, ctx.userId, input as AddCommentInput);
      return commitResult({
        id: comment.id,
        taskId: comment.itemId,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      });
    },
  },
  {
    name: "task_lists.list",
    description: "List task lists with project and task counts.",
    inputSchema: createTaskListSchema.pick({ projectId: true }).partial(),
    requiredPageKey: "tasks",
    accessLevel: "READ",
    async handler(ctx, input) {
      const projectId = (input as { projectId?: number }).projectId;
      const seeAll = await canSeeAllProjects(ctx.db, ctx.userId, ctx.companyId);
      return dataResult({ lists: await listTaskLists(ctx.db, ctx.companyId, projectId, seeAll ? undefined : ctx.userId) });
    },
  },
  {
    name: "task_lists.create",
    description: "Create a task list under a project.",
    inputSchema: createTaskListSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const row = await gkCreateTaskList(ctx.db, ctx.companyId, ctx.userId, input as never);
      return commitResult(row);
    },
  },
  {
    name: "task_lists.delete",
    description: "Delete a task list with an audited snapshot of the list and all its tasks. A project must keep one list.",
    inputSchema: deleteTaskListSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { listId: number; reason: string };
      const audit = await deleteTaskListWithAudit(ctx.db, {
        companyId: ctx.companyId,
        actorId: ctx.userId,
        listId: data.listId,
        reason: data.reason,
      });
      return commitResult({ deleted: true, deletionAuditId: audit.id });
    },
  },
  {
    name: "task_lists.rename",
    description: "Rename a task list.",
    inputSchema: renameTaskListSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await renameTaskList(ctx.db, ctx.companyId, input as never));
    },
  },
  {
    name: "task_lists.archive",
    description: "Archive an empty task list.",
    inputSchema: archiveTaskListSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await archiveTaskList(ctx.db, ctx.companyId, input as never));
    },
  },
  {
    name: "tasks.delete",
    description: "Delete a task with an immutable audit snapshot. A reason is required.",
    inputSchema: deleteTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { taskId: number; reason: string };
      const audit = await deleteTaskWithAudit(ctx.db, {
        companyId: ctx.companyId,
        actorId: ctx.userId,
        taskId: data.taskId,
        reason: data.reason,
      });
      return commitResult({ deleted: true, deletionAuditId: audit.id });
    },
  },
  {
    name: "tasks.delete_comment",
    description: "Delete a task comment with an immutable audit snapshot. A reason is required.",
    inputSchema: deleteCommentSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const data = input as { commentId: number; reason: string };
      const audit = await deleteCommentWithAudit(ctx.db, {
        companyId: ctx.companyId,
        actorId: ctx.userId,
        commentId: data.commentId,
        reason: data.reason,
      });
      return commitResult({ deleted: true, deletionAuditId: audit.id });
    },
  },
  {
    name: "tasks.archive",
    description: "Archive or restore a task and its subtasks (archived tasks are hidden from default lists).",
    inputSchema: archiveTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const result = await ctx.db.$transaction((tx) => gkSetTaskArchived(tx, ctx.companyId, ctx.userId, input as never));
      return commitResult(result);
    },
  },
  {
    name: "tasks.bulk",
    description: "Bulk archive, unarchive or move tasks (target list and/or parent task).",
    inputSchema: bulkTaskActionSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const result = await ctx.db.$transaction((tx) => gkBulkUpdateTasks(tx, ctx.companyId, ctx.userId, input as never));
      return commitResult(result);
    },
  },
];
