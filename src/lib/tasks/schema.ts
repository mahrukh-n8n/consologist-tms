import { z } from "zod";
import { TaskPriority, TaskQuadrant, TaskStatus } from "@/generated/prisma/enums";

export const createTaskSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  listId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.string().max(20_000).default(""),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.NO_PROGRESS),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.NONE),
  quadrant: z.nativeEnum(TaskQuadrant).nullable().optional(),
  parentId: z.coerce.number().int().positive().optional(),
  startAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  assigneeIds: z.array(z.coerce.number().int().positive()).max(20).default([]),
  customStatusId: z.coerce.number().int().positive().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  status: z.nativeEnum(TaskStatus),
});

export const updateTaskDetailsSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  projectId: z.coerce.number().int().positive(),
  listId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).default(""),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(TaskPriority),
  quadrant: z.nativeEnum(TaskQuadrant).nullable().optional(),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  dueAt: z.string().optional(),
  customStatusId: z.coerce.number().int().positive().optional(),
  assigneeIds: z.array(z.coerce.number().int().positive()).max(50).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
});

export const listTasksSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  listId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  quadrant: z.nativeEnum(TaskQuadrant).optional(),
  archived: z.preprocess((value) => (typeof value === "string" ? value === "true" : value), z.boolean()).optional(),
  q: z.string().trim().max(200).optional(),
  due: z.enum(["overdue", "today", "week"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export const bulkTaskActionSchema = z.object({
  taskIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
  action: z.enum(["archive", "unarchive", "move"]),
  listId: z.coerce.number().int().positive().optional(),
  parentId: z.coerce.number().int().positive().nullable().optional(),
});

export const archiveTaskSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  archived: z.boolean().default(true),
});

export const addCommentSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "Comment is required").max(10_000),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type UpdateTaskDetailsInput = z.infer<typeof updateTaskDetailsSchema>;
export type ArchiveTaskInput = z.infer<typeof archiveTaskSchema>;
export type BulkTaskActionInput = z.infer<typeof bulkTaskActionSchema>;
export type AddCommentInput = z.infer<typeof addCommentSchema>;
