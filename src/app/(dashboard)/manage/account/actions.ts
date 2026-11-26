"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";
import { updateAlertPreferences } from "@/lib/account/alert-preferences";

export type KeyState = { success: boolean; rawKey?: string; error?: string };

export async function createMcpKeyAction(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const { user, company } = await requireCompany();
  try {
    await requirePageWrite(user.id, company.id, "manage-account");
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Not allowed." };
  }

  const label = String(formData.get("label") ?? "").trim() || null;
  const rawKey = `fc_${randomBytes(24).toString("hex")}`;
  const keyHash = await bcrypt.hash(rawKey, 12);
  await prisma.mcpApiKey.create({
    data: { userId: user.id, companyId: company.id, keyHash, keyPrefix: rawKey.slice(-4), label },
  });
  revalidatePath("/manage/account");
  return { success: true, rawKey };
}

export async function setMcpWritesAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-account");
  const enabled = formData.get("enabled") === "true";
  await prisma.user.update({ where: { id: user.id }, data: { mcpWritesEnabled: enabled } });
  revalidatePath("/manage/account");
}

export async function revokeMcpKeyAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-account");
  const id = Number(formData.get("id"));
  await prisma.mcpApiKey.updateMany({
    where: { id, userId: user.id, companyId: company.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/manage/account");
}

export async function updateAlertPrefsAction(formData: FormData): Promise<void> {
  const { user, company } = await requireCompany();
  await requirePageWrite(user.id, company.id, "manage-account");
  const value = (name: string) => formData.get(name) === "on";
  await updateAlertPreferences(prisma, {
    userId: user.id,
    companyId: company.id,
    dueSoon: value("dueSoon"),
    overdue: value("overdue"),
    comment: value("comment"),
    mention: value("mention"),
    digest: value("digest"),
  });
  revalidatePath("/manage/account");
}
