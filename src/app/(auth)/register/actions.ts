"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { COOKIE_MAX_AGE, COOKIE_NAME, createSession } from "@/modules/auth-session";
import { Role } from "@/generated/prisma/enums";
import { seedDefaultApplications, seedStarterWorkspace } from "@/lib/company/seed-company-defaults";
import { ensureDefaultTemplates } from "@/lib/rbac/default-assignment";

export async function registerAction(formData: FormData): Promise<void> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const workspace = String(formData.get("workspace") ?? "").trim() || "My Workspace";

  if (!fullName || !email || password.length < 8) {
    redirect("/register?error=invalid");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/register?error=exists");

  const passwordHash = await bcrypt.hash(password, 12);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, fullName, passwordHash },
    });
    const company = await tx.company.create({ data: { name: workspace } });
    await tx.userCompanyRole.create({
      data: { userId: created.id, companyId: company.id, role: Role.SUPER_ADMIN },
    });
    await seedDefaultApplications(tx);
    await seedStarterWorkspace(tx, company.id, created.id);
    return created;
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      redirect("/register?error=exists");
    }
    throw error;
  }

  const role = await prisma.userCompanyRole.findFirst({
    where: { userId: user.id },
    select: { companyId: true },
  });
  if (role) await ensureDefaultTemplates(prisma, role.companyId);

  const token = await createSession(prisma, { userId: user.id, email: user.email });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect("/dashboard");
}
