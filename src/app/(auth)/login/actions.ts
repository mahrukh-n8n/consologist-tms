"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { COOKIE_MAX_AGE, COOKIE_NAME, createSession } from "@/modules/auth-session";
import { clearLoginFailures, isLoginBlocked, loginRateKey, recordLoginFailure } from "@/lib/auth/login-rate-limit";

function safeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const forwarded = (await headers()).get("x-forwarded-for") ?? "local";
  const ip = forwarded.split(",")[0]?.trim() || "local";
  const rateKey = loginRateKey(email, ip);
  if (isLoginBlocked(rateKey)) {
    redirect(`/login?error=rate&returnTo=${encodeURIComponent(returnTo)}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    recordLoginFailure(rateKey);
    redirect(`/login?error=invalid&returnTo=${encodeURIComponent(returnTo)}`);
  }
  clearLoginFailures(rateKey);

  const token = await createSession(prisma, { userId: user.id, email: user.email });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect(returnTo);
}
