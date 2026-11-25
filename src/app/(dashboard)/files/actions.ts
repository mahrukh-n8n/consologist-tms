"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { MAX_UPLOAD_BYTES, uploadWorkspaceFile } from "@/lib/files/service";

export type ActionState = { success: boolean; error?: string };
export async function uploadFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requireWriteGate(user.id, company.id, "files");
    const projectId = Number(formData.get("projectId"));
    const file = formData.get("file");
    if (!Number.isInteger(projectId) || projectId <= 0) return { success: false, error: "Choose a project." };
    if (!(file instanceof File) || file.size === 0) return { success: false, error: "Choose a file." };
    if (file.size > MAX_UPLOAD_BYTES) return { success: false, error: "Files are limited to 10 MB." };
    await uploadWorkspaceFile(prisma, company.id, user.id, {
      projectId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    revalidatePath("/files");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Upload failed." }; }
}
