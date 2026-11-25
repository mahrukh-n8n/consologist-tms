"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { consumeEmailToken, TOKEN_TYPE } from "@/modules/auth-session";

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect(`/reset-password?token=${token}&error=Password+must+be+at+least+8+characters`);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await consumeEmailToken(tx, token, TOKEN_TYPE.PASSWORD_RESET);
      const passwordHash = await bcrypt.hash(password, 12);
      await tx.user.update({ where: { id: consumed.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: consumed.userId } });
      return consumed;
    });
    if (!result) redirect("/login");
  } catch {
    redirect(`/reset-password?token=${token}&error=This+link+is+invalid+or+expired`);
  }

  redirect("/login");
}
