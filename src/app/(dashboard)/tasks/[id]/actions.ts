"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite, requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { gkUpdateTaskDescription } from "@/lib/mutations/tasks";
import { deleteCommentWithAudit, deleteTaskWithAudit } from "@/lib/audit/delete-with-audit";
import { attachTags, detachTag, tagTitlesSchema, tagIdSchema } from "@/lib/tasks/tags";

export type ActionState = { success: boolean; error?: string };

export async function deleteTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requireWriteGate(user.id, company.id, "tasks");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { success: false, error: "A deletion reason is required." };
    await deleteTaskWithAudit(prisma, { companyId: company.id, actorId: user.id, taskId: Number(formData.get("taskId")), reason });
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Delete failed." }; }
}

export async function updateTaskDescriptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "tasks");
    const taskId = Number(formData.get("taskId"));
    if (!Number.isInteger(taskId) || taskId <= 0) return { success: false, error: "Invalid task." };
    await prisma.$transaction((tx) =>
      gkUpdateTaskDescription(tx, company.id, user.id, {
        taskId,
        description: String(formData.get("description") ?? ""),
      })
    );
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Save failed." };
  }
}

export async function attachTagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requireWriteGate(user.id, company.id, "tasks");
    const parsed = tagTitlesSchema.safeParse({
      taskId: formData.get("taskId"),
      titles: String(formData.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (!parsed.success) return { success: false, error: "Enter at least one tag." };
    await attachTags(prisma, company.id, user.id, parsed.data.taskId, parsed.data.titles);
    revalidatePath(`/tasks/${parsed.data.taskId}`);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Tag failed." }; }
}

export async function detachTagAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requireWriteGate(user.id, company.id, "tasks");
  const parsed = tagIdSchema.safeParse({ tagId: formData.get("tagId") });
  const taskId = Number(formData.get("taskId"));
  if (!parsed.success || !Number.isInteger(taskId)) throw new Error("Invalid tag request.");
  await detachTag(prisma, company.id, taskId, parsed.data.tagId);
  revalidatePath(`/tasks/${taskId}`);
}


export async function deleteCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requireWriteGate(user.id, company.id, "tasks");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { success: false, error: "A deletion reason is required." };
    await deleteCommentWithAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      commentId: Number(formData.get("commentId")),
      reason,
    });
    revalidatePath(`/tasks/${Number(formData.get("taskId"))}`);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Delete failed." }; }
}
