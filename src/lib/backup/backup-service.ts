import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  createBackup,
  dataSourceRegistry,
  deleteBackup,
  executeRestore,
  previewRestore,
  retrieveBackup,
} from "@/modules/backup";
import { isConnected } from "@/modules/google-drive";
import { createDriveUploader } from "./drive-adapter";
import { registerBackupSources } from "./register-sources";

type Db = PrismaClient;

export const createBackupSchema = z.object({
  password: z.string().min(8, "Backup password must be at least 8 characters."),
});

export const restoreBackupSchema = z.object({
  backupId: z.coerce.number().int().positive(),
  password: z.string().min(1),
  confirm: z.literal("RESTORE"),
});

export const previewRestoreSchema = z.object({
  backupId: z.coerce.number().int().positive(),
  password: z.string().min(1),
});

export const deleteBackupSchema = z.object({
  backupId: z.coerce.number().int().positive(),
});

function drive(db: Db, companyId: number) {
  return isConnected(db, companyId).then((connected) => ({
    connected,
    uploader: connected ? createDriveUploader(db) : undefined,
  }));
}

export async function listWorkspaceBackups(
  db: Db,
  companyId: number,
  options: { page?: number; limit?: number } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const [rows, total] = await Promise.all([
    db.backup.findMany({
      where: { companyId },
      select: {
        id: true, fileName: true, fileSize: true, checksum: true, sourceCount: true,
        storageLocations: true, isSafetyBackup: true, driveFileId: true, createdAt: true,
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.backup.count({ where: { companyId } }),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      storageLocations: row.storageLocations.split(",").filter(Boolean),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function createWorkspaceBackup(
  db: Db,
  input: { companyId: number; userId: number; password: string }
) {
  const d = await drive(db, input.companyId);
  return createBackup(db, dataSourceRegistry, {
    companyId: input.companyId,
    userId: input.userId,
    password: input.password,
    destinations: d.connected ? ["db", "filesystem", "drive"] : ["db", "filesystem"],
    driveUploader: d.uploader,
  });
}

export async function previewWorkspaceRestore(
  db: Db,
  input: { companyId: number; backupId: number; password: string }
) {
  const d = await drive(db, input.companyId);
  const encryptedData = await retrieveBackup(db, input.backupId, input.companyId, d.uploader);
  return previewRestore(dataSourceRegistry, { encryptedData, password: input.password }, db, input.companyId);
}

export async function executeWorkspaceRestore(
  db: Db,
  input: { companyId: number; userId: number; backupId: number; password: string }
) {
  const d = await drive(db, input.companyId);
  const encryptedData = await retrieveBackup(db, input.backupId, input.companyId, d.uploader);
  return executeRestore({
    db,
    registry: dataSourceRegistry,
    encryptedData,
    password: input.password,
    restoreOptions: { mode: "full" },
    companyId: input.companyId,
    userId: input.userId,
    safetyBackupPassword: input.password,
    safetyBackupDestinations: d.connected ? ["db", "filesystem", "drive"] : ["db", "filesystem"],
    driveUploader: d.uploader,
  });
}

export async function deleteWorkspaceBackup(
  db: Db,
  input: { companyId: number; backupId: number }
) {
  const d = await drive(db, input.companyId);
  await deleteBackup(db, input.backupId, input.companyId, d.uploader);
}

export { registerBackupSources };
