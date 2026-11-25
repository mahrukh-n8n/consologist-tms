import { open } from "node:fs/promises";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DriveFile, DriveUploadOptions } from "../models/types";
import { decryptToken } from "./connection";
import { refreshAccessToken } from "./auth";

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

async function getAccessToken(
  db: PrismaClient,
  companyId: number
): Promise<{ accessToken: string; folderId: string }> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are required");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.findUnique({ where: { companyId } });
  if (!row) throw new Error(`No Google Drive connection for companyId ${companyId}`);

  const refreshToken = decryptToken(row.encryptedRefreshToken);
  const accessToken = await refreshAccessToken({ refreshToken, clientId, clientSecret });
  return { accessToken, folderId: row.folderId };
}

async function getOrCreateSubfolder(
  accessToken: string,
  parentFolderId: string,
  subfolderName: string
): Promise<string> {
  const query = `name='${subfolderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (searchRes.ok) {
    const { files } = await searchRes.json();
    if (files && files.length > 0) return files[0].id as string;
  }

  const createRes = await fetch(`${DRIVE_FILES_URL}?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: subfolderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create subfolder "${subfolderName}": ${err}`);
  }
  const { id } = await createRes.json();
  return id as string;
}

export async function uploadFile(
  db: PrismaClient,
  companyId: number,
  fileBuffer: Buffer,
  opts: DriveUploadOptions
): Promise<DriveFile> {
  const { accessToken, folderId } = await getAccessToken(db, companyId);

  const targetFolderId = opts.subfolder
    ? await getOrCreateSubfolder(accessToken, folderId, opts.subfolder)
    : folderId;

  const metadata = JSON.stringify({ name: opts.name, parents: [targetFolderId] });
  const boundary = "boundary_" + Math.random().toString(36).slice(2);

  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`;
  const closePart = `\r\n--${boundary}--`;

  const fullBody = Buffer.concat([
    Buffer.from(metadataPart, "utf8"),
    Buffer.from(filePart, "utf8"),
    fileBuffer,
    Buffer.from(closePart, "utf8"),
  ]);

  const res = await fetch(`${DRIVE_UPLOAD_URL}&fields=id,webViewLink,webContentLink,name,mimeType`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(fullBody.length),
    },
    body: fullBody,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    fileId: data.id as string,
    webViewLink: data.webViewLink as string,
    downloadUrl: data.webContentLink as string,
    name: data.name as string,
    mimeType: data.mimeType as string,
  };
}

/** File uploads use 4 MiB resumable requests, independent of total file size.
 * https://developers.google.com/workspace/drive/api/guides/manage-uploads */
export async function uploadFilePath(db: PrismaClient, companyId: number, path: string, opts: DriveUploadOptions): Promise<DriveFile> {
  const { accessToken, folderId } = await getAccessToken(db, companyId);
  const targetFolderId = opts.subfolder ? await getOrCreateSubfolder(accessToken, folderId, opts.subfolder) : folderId;
  const file = await open(path, "r");
  try {
    const size = (await file.stat()).size;
    const session = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink,webContentLink,name,mimeType", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Upload-Content-Type": opts.mimeType, "X-Upload-Content-Length": String(size) },
      body: JSON.stringify({ name: opts.name, parents: [targetFolderId] }), signal: AbortSignal.timeout(60000),
    });
    const location = session.headers.get("location");
    if (!session.ok || !location) throw new Error(`Drive upload initialization failed (${session.status})`);
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    for (let offset = 0; offset < size;) {
      const length = Math.min(buffer.length, size - offset);
      let loaded = 0;
      while (loaded < length) {
        const { bytesRead } = await file.read(buffer, loaded, length - loaded, offset + loaded);
        if (!bytesRead) throw new Error("Backup file changed during Drive upload");
        loaded += bytesRead;
      }
      const end = offset + length;
      const response = await fetch(location, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": opts.mimeType, "Content-Length": String(length), "Content-Range": `bytes ${offset}-${end - 1}/${size}` }, body: buffer.subarray(0, length), signal: AbortSignal.timeout(60000) });
      if (end < size) {
        await response.body?.cancel();
        if (response.status !== 308 || response.headers.get("range") !== `bytes=0-${end - 1}`) throw new Error(`Drive upload chunk was not confirmed (${response.status})`);
      } else {
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Drive upload failed (${response.status})`); }
        const data = await response.json();
        if (typeof data.id !== "string") throw new Error("Drive upload did not return a file reference");
        return { fileId: data.id, webViewLink: data.webViewLink, downloadUrl: data.webContentLink, name: data.name, mimeType: data.mimeType };
      }
      offset = end;
    }
    throw new Error("Cannot upload an empty backup");
  } finally { await file.close(); }
}
