"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, destroySession } from "@/modules/auth-session";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/require-auth";

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) await destroySession(prisma, token);
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}


export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const { user } = await requireAuth();
  const companyId = Number(formData.get("companyId"));
  if (!Number.isInteger(companyId)) return;
  const membership = await prisma.userCompanyRole.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    select: { companyId: true },
  });
  if (!membership) throw new Error("You are not a member of that workspace.");
  const cookieStore = await cookies();
  cookieStore.set("activeCompanyId", String(companyId), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}
