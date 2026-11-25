import type { PrismaClient } from "@/generated/prisma/client";
import type { DriveUploader } from "@/modules/backup";
import {
  getDecryptedRefreshToken,
  isConnected,
  refreshAccessToken,
  uploadFile,
  uploadFilePath,
} from "@/modules/google-drive";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

function requireDriveEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are required.");
  }
  return { clientId, clientSecret };
}

async function accessToken(db: PrismaClient, companyId: number): Promise<string> {
  const refreshToken = await getDecryptedRefreshToken(db, companyId);
  if (!refreshToken) throw new Error("Google Drive is not connected for this workspace.");
  return refreshAccessToken({ refreshToken, ...requireDriveEnv() });
}

/** Bridge the portable backup module's DriveUploader contract to the drive module. */
export function createDriveUploader(db: PrismaClient): DriveUploader {
  return {
    async upload(fileName, data, companyId) {
      const file = await uploadFile(db, companyId, data, {
        name: fileName,
        mimeType: "application/octet-stream",
        subfolder: "backups",
      });
      return file.fileId;
    },
    async uploadPath(fileName, path, companyId) {
      const file = await uploadFilePath(db, companyId, path, {
        name: fileName,
        mimeType: "application/octet-stream",
        subfolder: "backups",
      });
      return file.fileId;
    },
    async download(driveFileId, companyId) {
      const token = await accessToken(db, companyId);
      const res = await fetch(`${DRIVE_FILES_URL}/${driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`Drive download failed (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(driveFileId, companyId) {
      const token = await accessToken(db, companyId);
      const res = await fetch(`${DRIVE_FILES_URL}/${driveFileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed (${res.status}).`);
    },
    async rename(driveFileId, fileName, companyId) {
      const token = await accessToken(db, companyId);
      const res = await fetch(`${DRIVE_FILES_URL}/${driveFileId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: fileName }),
      });
      if (!res.ok) throw new Error(`Drive rename failed (${res.status}).`);
    },
    isConnected(companyId) {
      return isConnected(db, companyId);
    },
  };
}
