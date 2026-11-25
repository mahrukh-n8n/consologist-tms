"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { COOKIE_MAX_AGE, COOKIE_NAME, createSession } from "@/modules/auth-session";
import { getAuthenticatedUser } from "@/lib/auth/get-session";
import { assignRoleTemplate } from "@/lib/rbac/default-assignment";

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!token || !fullName || password.length < 8) {
    redirect(`/accept-invite?token=${encodeURIComponent(token)}&error=invalid`);
  }

  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation || invitation.accepted || invitation.expiresAt <= new Date()) {
    redirect(`/accept-invite?token=${encodeURIComponent(token)}&error=expired`);
  }

  const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (existing?.passwordHash) {
    const current = await getAuthenticatedUser();
    if (!current || current.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      redirect(`/accept-invite?token=${encodeURIComponent(token)}&error=signin`);
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { email: invitation.email },
      data: { fullName, passwordHash },
    });
    await tx.userCompanyRole.upsert({
      where: { userId_companyId: { userId: updatedUser.id, companyId: invitation.companyId } },
      update: { role: invitation.role },
      create: { userId: updatedUser.id, companyId: invitation.companyId, role: invitation.role },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { accepted: true } });
    return updatedUser;
  });

  await assignRoleTemplate(prisma, {
    userId: user.id,
    companyId: invitation.companyId,
    role: invitation.role,
    assignedBy: invitation.invitedBy,
  });

  const session = await createSession(prisma, { userId: user.id, email: user.email });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect("/dashboard");
}
