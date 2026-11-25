"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import {
  archiveCustomStatus,
  archiveCustomStatusSchema,
  createCustomStatusSchema,
  gkCreateCustomStatus,
} from "@/lib/tasks/custom-statuses";

export type StatusState = { success: boolean; error?: string };

export async function createStatusAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-statuses");
    const parsed = createCustomStatusSchema.safeParse({
      name: formData.get("name"),
      color: formData.get("color") || "#4a86f7",
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid status." };
    await gkCreateCustomStatus(prisma, company.id, parsed.data);
    revalidatePath("/manage-system/statuses");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Status creation failed." };
  }
}

export async function archiveStatusAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-system-statuses");
  const parsed = archiveCustomStatusSchema.safeParse({ statusId: formData.get("id") });
  if (!parsed.success) throw new Error("Invalid status id.");
  await archiveCustomStatus(prisma, company.id, parsed.data.statusId);
  revalidatePath("/manage-system/statuses");
}
