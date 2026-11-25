"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";
import { seedDefaultApplications, seedStarterWorkspace } from "@/lib/company/seed-company-defaults";

export async function createWorkspaceAction(formData: FormData): Promise<void> {
  const { user } = await requireAuth();
  const name = String(formData.get("name") ?? "").trim() || "My Workspace";

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name } });
    await tx.userCompanyRole.create({
      data: { userId: user.id, companyId: company.id, role: Role.SUPER_ADMIN },
    });
    await seedDefaultApplications(tx);
    await seedStarterWorkspace(tx, company.id, user.id);
  });

  redirect("/dashboard");
}
