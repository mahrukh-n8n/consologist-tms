"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { createTimeSchema, gkCreateTimeRecord } from "@/lib/time/service";

export type ActionState = { success: boolean; error?: string };
export async function createTimeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "dashboard-time");
    const parsed = createTimeSchema.safeParse({
      projectId: formData.get("projectId"), date: formData.get("date"),
      minutes: formData.get("minutes"), description: formData.get("description") ?? "",
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid time record." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "time.create", pageKey: "dashboard-time", payload: parsed.data, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkCreateTimeRecord(prisma, company.id, user.id, parsed.data);
    revalidatePath("/dashboard/time");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Time record failed." }; }
}
