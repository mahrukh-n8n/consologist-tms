import type { PrismaClient } from "@/generated/prisma/client";
import type { SharePermission, DriveShareOptions } from "../models/types";
import { refreshAccessToken } from "./auth";
import { decryptToken } from "./connection";

async function getAccessTokenAndFolder(
  db: PrismaClient,
  companyId: number
): Promise<{ accessToken: string; folderId: string }> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.findUnique({ where: { companyId } });
  if (!row) throw new Error("No Google Drive connection found");
  const refreshToken = decryptToken(row.encryptedRefreshToken);
  const accessToken = await refreshAccessToken({ refreshToken, clientId, clientSecret });
  return { accessToken, folderId: row.folderId };
}

export async function shareFolder(
  db: PrismaClient,
  companyId: number,
  opts: DriveShareOptions
): Promise<SharePermission> {
  const { accessToken, folderId } = await getAccessTokenAndFolder(db, companyId);
  const role = opts.role ?? "reader";

  const body = opts.email
    ? { role, type: "user", emailAddress: opts.email }
    : { role, type: "anyone" };

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=id,role,type,emailAddress`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 404 || err.includes("notFound")) {
      throw new Error("This email doesn't have a Google account or cannot be found");
    }
    throw new Error(`Share failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    permissionId: data.id as string,
    role: data.role as "reader" | "writer",
    type: data.type as "user" | "anyone",
    emailAddress: data.emailAddress as string | undefined,
  };
}

export async function listPermissions(
  db: PrismaClient,
  companyId: number
): Promise<SharePermission[]> {
  const { accessToken, folderId } = await getAccessTokenAndFolder(db, companyId);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=permissions(id,role,type,emailAddress)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`List permissions failed (${res.status})`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.permissions ?? []).map((p: any) => ({
    permissionId: p.id,
    role: p.role,
    type: p.type,
    emailAddress: p.emailAddress,
  }));
}

export async function removePermission(
  db: PrismaClient,
  companyId: number,
  permissionId: string
): Promise<void> {
  const { accessToken, folderId } = await getAccessTokenAndFolder(db, companyId);
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${permissionId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}
