import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { uploadFile } from "@/modules/google-drive";
import { isConnected } from "@/modules/google-drive";
import { assertProjectWrite } from "@/lib/projects/access";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadFileSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  base64: z.string().min(1),
});

export const createFileSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  size: z.coerce.number().int().positive().max(MAX_UPLOAD_BYTES),
  driveFileId: z.string().min(1),
  webViewLink: z.string().url(),
  downloadUrl: z.string().url(),
});

export function listFiles(db: PrismaClient, companyId: number, projectId?: number, memberUserId?: number) {
  return db.fileRecord.findMany({
    where: {
      project: {
        group: { companyId },
        ...(projectId ? { id: projectId } : {}),
        ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
      },
    },
    include: { project: { select: { name: true } }, folder: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Attachments linked to a single task (FileRecord.itemType = "task"). */
export function listTaskFiles(db: PrismaClient, companyId: number, taskId: number, memberUserId?: number) {
  return db.fileRecord.findMany({
    where: {
      itemType: "task",
      itemId: taskId,
      project: {
        group: { companyId },
        ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
      },
    },
    select: { id: true, name: true, mimeType: true, size: true, webViewLink: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

export async function createFileRecord(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: z.infer<typeof createFileSchema> & { itemType?: string | null; itemId?: number | null }
) {
  const project = await db.project.findFirst({ where: { id: input.projectId, group: { companyId } }, select: { id: true } });
  if (!project) throw new Error("Project not found in this workspace.");
  await assertProjectWrite(db, companyId, userId, input.projectId);
  return db.fileRecord.create({
    data: {
      projectId: input.projectId,
      uploadedById: userId,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      driveFileId: input.driveFileId,
      webViewLink: input.webViewLink,
      downloadUrl: input.downloadUrl,
      itemType: input.itemType ?? null,
      itemId: input.itemId ?? null,
    },
  });
}

/** Upload bytes to Drive, then persist metadata. Caller enforces the size cap. */
export async function uploadWorkspaceFile(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: { projectId: number; name: string; mimeType: string; bytes: Buffer; itemType?: string | null; itemId?: number | null }
) {
  const project = await db.project.findFirst({ where: { id: input.projectId, group: { companyId } }, select: { id: true } });
  if (!project) throw new Error("Project not found in this workspace.");
  await assertProjectWrite(db, companyId, userId, input.projectId);
  if (!(await isConnected(db, companyId))) throw new Error("Google Drive is not connected for this workspace.");
  if (input.bytes.length === 0) throw new Error("The selected file is empty.");
  if (input.bytes.length > MAX_UPLOAD_BYTES) throw new Error("Files are limited to 10 MB.");
  const uploaded = await uploadFile(db, companyId, input.bytes, {
    name: input.name,
    mimeType: input.mimeType,
    subfolder: `project-${input.projectId}`,
  });
  return createFileRecord(db, companyId, userId, {
    projectId: input.projectId,
    name: uploaded.name,
    mimeType: uploaded.mimeType,
    size: input.bytes.length,
    driveFileId: uploaded.fileId,
    webViewLink: uploaded.webViewLink,
    downloadUrl: uploaded.downloadUrl,
    itemType: input.itemType ?? null,
    itemId: input.itemId ?? null,
  });
}

/**
 * Upload a file to Google Drive and attach its metadata to a task.
 * Drive must be connected; the task is resolved first so a foreign taskId cannot attach files.
 */
export async function uploadTaskFile(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: { taskId: number; name: string; mimeType: string; bytes: Buffer }
) {
  const task = await db.task.findFirst({
    where: { id: input.taskId, project: { group: { companyId } } },
    select: { id: true, projectId: true },
  });
  if (!task) throw new Error("Task not found in this workspace.");
  await assertProjectWrite(db, companyId, userId, task.projectId);
  return uploadWorkspaceFile(db, companyId, userId, {
    projectId: task.projectId,
    name: input.name,
    mimeType: input.mimeType,
    bytes: input.bytes,
    itemType: "task",
    itemId: task.id,
  });
}
