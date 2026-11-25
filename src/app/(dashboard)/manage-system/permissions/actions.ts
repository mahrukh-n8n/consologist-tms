"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import { assignTemplate } from "@/modules/auth-rbac/services/assignment-service";
import { z } from "zod";

export type ActionState = { success: boolean; error?: string };
const schema = z.object({ userId: z.coerce.number().int().positive(), templateId: z.coerce.number().int().positive() });

export async function assignTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-permissions");
    const parsed = schema.safeParse({ userId: formData.get("userId"), templateId: formData.get("templateId") });
    if (!parsed.success) return { success: false, error: "Choose a user and template." };
    await assignTemplate(prisma, {
      userId: parsed.data.userId,
      companyId: company.id,
      templateId: parsed.data.templateId,
      assignedBy: user.id,
    });
    revalidatePath("/manage-system/permissions");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Assignment failed." }; }
}
