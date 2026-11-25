import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getActiveCompany } from "@/lib/company/get-active-company";
import { prisma } from "@/lib/db";
import { exchangeCode, saveConnection } from "@/modules/google-drive";
import { requirePageWrite } from "@/modules/auth-rbac/middleware/page-access";

export const dynamic = "force-dynamic";

async function ensureFolder(accessToken: string, name: string): Promise<{ id: string; name: string }> {
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (search.ok) {
    const data = await search.json();
    if (data.files?.[0]) return data.files[0];
  }
  const created = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!created.ok) throw new Error(`Failed to create Drive folder (${created.status}).`);
  return created.json();
}

export async function GET(request: Request) {
  const { user } = await requireAuth();
  const company = await getActiveCompany(user.id);
  await requirePageWrite(user.id, company.id, "manage-system-drive");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expected = cookieStore.get("gd_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/manage-system/drive?error=state", url.origin));
  }
  cookieStore.delete("gd_oauth_state");

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${process.env.APP_URL ?? url.origin}/api/google-drive/callback`;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/manage-system/drive?error=config", url.origin));
  }

  try {
    const tokens = await exchangeCode({ code, clientId, clientSecret, redirectUri });
    const folder = await ensureFolder(tokens.accessToken, "Consologist TMS");
    await saveConnection(prisma, {
      companyId: company.id,
      refreshToken: tokens.refreshToken,
      folderId: folder.id,
      folderName: folder.name,
      connectedByUserId: user.id,
    });
    return NextResponse.redirect(new URL("/manage-system/drive?connected=1", url.origin));
  } catch (error) {
    console.error("Drive callback failed:", error);
    return NextResponse.redirect(new URL("/manage-system/drive?error=exchange", url.origin));
  }
}
