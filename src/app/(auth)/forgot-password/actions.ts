"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createEmailToken, sendPasswordResetEmail, TOKEN_TYPE } from "@/modules/auth-session";
import { APP_NAME, APP_URL } from "@/lib/app";

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (user) {
    const token = await createEmailToken(prisma, { userId: user.id, type: TOKEN_TYPE.PASSWORD_RESET });
    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: `${APP_URL}/reset-password?token=${token}`,
        appName: APP_NAME,
        appUrl: APP_URL,
      });
    } catch (error) {
      console.error("Password reset email failed:", error);
    }
  }

  redirect("/forgot-password?sent=1");
}
