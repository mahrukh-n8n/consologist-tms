"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import { approvePendingApproval, rejectPendingApproval } from "@/lib/approval/gatekeeper";

export type ApprovalState = { success: boolean; error?: string };

export async function approveAction(_prev: ApprovalState, formData: FormData): Promise<ApprovalState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-approvals");
    await approvePendingApproval(prisma, {
      approvalId: Number(formData.get("id")),
      companyId: company.id,
      reviewerId: user.id,
    });
    revalidatePath("/manage-system/approvals");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Approval failed." };
  }
}

export async function rejectAction(_prev: ApprovalState, formData: FormData): Promise<ApprovalState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-system-approvals");
    await rejectPendingApproval(prisma, {
      approvalId: Number(formData.get("id")),
      companyId: company.id,
      reviewerId: user.id,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/manage-system/approvals");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Rejection failed." };
  }
}
