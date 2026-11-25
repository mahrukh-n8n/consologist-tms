"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import { deleteTag, renameTag, renameTagSchema, tagIdSchema } from "@/lib/tasks/tags";

export type ActionState = { success: boolean; error?: string };
export async function renameTagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-tags");
    const parsed = renameTagSchema.safeParse({ tagId: formData.get("tagId"), title: formData.get("title") });
    if (!parsed.success) return { success: false, error: "A tag and title are required." };
    await renameTag(prisma, company.id, parsed.data.tagId, parsed.data.title);
    revalidatePath("/manage-system/tags");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Rename failed." }; }
}
export async function deleteTagAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-system-tags");
  const parsed = tagIdSchema.safeParse({ tagId: formData.get("tagId") });
  if (!parsed.success) throw new Error("Invalid tag id.");
  await deleteTag(prisma, company.id, parsed.data.tagId);
  revalidatePath("/manage-system/tags");
}
