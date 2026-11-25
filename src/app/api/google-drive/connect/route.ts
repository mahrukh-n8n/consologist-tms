import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getActiveCompany } from "@/lib/company/get-active-company";
import { buildAuthUrl } from "@/modules/google-drive";
import { appOrigin } from "@/lib/http/app-origin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await requireAuth();
  await getActiveCompany(user.id);

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${appOrigin()}/api/google-drive/callback`;
  if (!clientId) return NextResponse.json({ error: "GOOGLE_DRIVE_CLIENT_ID is not set." }, { status: 500 });

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("gd_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  const url = await buildAuthUrl({ clientId, redirectUri, state });
  return NextResponse.redirect(url);
}
