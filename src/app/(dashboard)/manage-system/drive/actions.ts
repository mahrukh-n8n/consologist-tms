"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import { deleteConnection } from "@/modules/google-drive";

export async function disconnectDriveAction(): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-system-drive");
  await deleteConnection(prisma, company.id);
  revalidatePath("/manage-system/drive");
}
