"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { createDiscussionSchema, gkCreateDiscussion } from "@/lib/discussions/service";

export type ActionState = { success: boolean; error?: string };
export async function createDiscussionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "discussions");
    const parsed = createDiscussionSchema.safeParse({ projectId: formData.get("projectId"), title: formData.get("title"), body: formData.get("body") ?? "" });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid discussion." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "discussions.create", pageKey: "discussions", payload: parsed.data, displayPayload: { title: parsed.data.title }, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkCreateDiscussion(prisma, company.id, user.id, parsed.data);
    revalidatePath("/discussions");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Discussion failed." }; }
}
