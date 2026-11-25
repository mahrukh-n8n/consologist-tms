import crypto from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DriveConnection, EncryptedToken } from "../models/types";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.GOOGLE_DRIVE_ENCRYPTION_KEY;
  if (!key) throw new Error("GOOGLE_DRIVE_ENCRYPTION_KEY environment variable is required");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) throw new Error("GOOGLE_DRIVE_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)");
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedToken = {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  return JSON.stringify(payload);
}

export class DriveDecryptionError extends Error {
  constructor() {
    super("Google Drive encryption key mismatch — the stored connection was encrypted with a different key. Please disconnect and reconnect Google Drive.");
    this.name = "DriveDecryptionError";
  }
}

export function decryptToken(encryptedJson: string): string {
  const key = getEncryptionKey();
  try {
    const { iv, tag, ciphertext }: EncryptedToken = JSON.parse(encryptedJson);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new DriveDecryptionError();
  }
}

export async function getConnection(
  db: PrismaClient,
  companyId: number
): Promise<DriveConnection | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.findUnique({ where: { companyId } });
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    folderId: row.folderId,
    folderName: row.folderName,
    connectedByUserId: row.connectedByUserId,
    connectedAt: row.connectedAt,
  };
}

export async function isConnected(db: PrismaClient, companyId: number): Promise<boolean> {
  // Env vars must be present — without them, uploads will fail even if DB row exists
  if (
    !process.env.GOOGLE_DRIVE_CLIENT_ID ||
    !process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
    !process.env.GOOGLE_DRIVE_ENCRYPTION_KEY
  ) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.findUnique({
    where: { companyId },
    select: { id: true, preferLocalStorage: true },
  });
  if (!row) return false;
  // Admin can toggle uploads to local even when Drive is connected
  if (row.preferLocalStorage) return false;
  return true;
}

/** Check if Drive row exists (regardless of preference toggle). Used by settings UI. */
export async function isDriveConfigured(db: PrismaClient, companyId: number): Promise<boolean> {
  if (
    !process.env.GOOGLE_DRIVE_CLIENT_ID ||
    !process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
    !process.env.GOOGLE_DRIVE_ENCRYPTION_KEY
  ) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.findUnique({
    where: { companyId },
    select: { id: true },
  });
  return !!row;
}

export async function saveConnection(
  db: PrismaClient,
  params: {
    companyId: number;
    refreshToken: string;
    folderId: string;
    folderName: string;
    connectedByUserId: number;
  }
): Promise<DriveConnection> {
  const encrypted = encryptToken(params.refreshToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.upsert({
    where: { companyId: params.companyId },
    create: {
      companyId: params.companyId,
      encryptedRefreshToken: encrypted,
      folderId: params.folderId,
      folderName: params.folderName,
      connectedByUserId: params.connectedByUserId,
    },
    update: {
      encryptedRefreshToken: encrypted,
      folderId: params.folderId,
      folderName: params.folderName,
      connectedByUserId: params.connectedByUserId,
      connectedAt: new Date(),
    },
  });
  return {
    id: row.id,
    companyId: row.companyId,
    folderId: row.folderId,
    folderName: row.folderName,
    connectedByUserId: row.connectedByUserId,
    connectedAt: row.connectedAt,
  };
}

export async function deleteConnection(db: PrismaClient, companyId: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).companyGoogleDrive.deleteMany({ where: { companyId } });
}

export async function getDecryptedRefreshToken(
  db: PrismaClient,
  companyId: number
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).companyGoogleDrive.findUnique({ where: { companyId } });
  if (!row) return null;
  return decryptToken(row.encryptedRefreshToken);
}
