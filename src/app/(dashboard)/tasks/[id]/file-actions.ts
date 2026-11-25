"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite, requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { MAX_UPLOAD_BYTES, uploadTaskFile } from "@/lib/files/service";
import { gkDeleteTaskFile } from "@/lib/mutations/task-files";

export type TaskFileState = { success: boolean; error?: string };

export async function uploadTaskFileAction(_prev: TaskFileState, formData: FormData): Promise<TaskFileState> {
  const { user, company } = await requireCompany();
  const taskId = Number(formData.get("taskId"));
  try {
    if (!Number.isInteger(taskId) || taskId <= 0) return { success: false, error: "Invalid task." };
    const gate = await requireWriteGate(user.id, company.id, "tasks");
    if (gate.needsApproval) return { success: false, error: "This action requires approval and is not available here." };
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { success: false, error: "Choose a file." };
    if (file.size > MAX_UPLOAD_BYTES) return { success: false, error: "Files are limited to 10 MB." };
    await uploadTaskFile(prisma, company.id, user.id, {
      taskId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Upload failed." };
  }
}

export async function deleteTaskFileAction(_prev: TaskFileState, formData: FormData): Promise<TaskFileState> {
  const { user, company } = await requireCompany();
  const taskId = Number(formData.get("taskId"));
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const fileId = Number(formData.get("fileId"));
    if (!Number.isInteger(fileId) || fileId <= 0) return { success: false, error: "Invalid attachment." };
    await gkDeleteTaskFile(prisma, company.id, user.id, fileId);
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Remove failed." };
  }
}
