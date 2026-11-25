"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import { markAllAsRead } from "@/lib/notifications/service";

export type ActionState = { success: boolean; error?: string };
export async function markAllReadAction(): Promise<ActionState> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "notifications");
  await markAllAsRead(user.id, company.id);
  revalidatePath("/notifications");
  return { success: true };
}
