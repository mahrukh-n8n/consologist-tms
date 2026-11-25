import { mkdir, writeFile, unlink, readFile, stat, rename as renameFile } from "fs/promises";
import { join } from "path";
import type { PrismaClient } from "@/generated/prisma/client";
import type { StorageDestination } from "../registry/types";

export interface DriveUploader {
  upload(fileName: string, data: Buffer, companyId: number): Promise<string>;
  uploadPath?: (fileName: string, path: string, companyId: number) => Promise<string>;
  download(driveFileId: string, companyId: number): Promise<Buffer>;
  delete(driveFileId: string, companyId: number): Promise<void>;
  rename(driveFileId: string, fileName: string, companyId: number): Promise<void>;
  isConnected(companyId: number): Promise<boolean>;
}

export interface StoreOptions {
  destinations: StorageDestination[];
  isSafetyBackup?: boolean;
  isScheduled?: boolean;
}

export interface StoreResult {
  backupId: number;
  storedIn: StorageDestination[];
  warnings: string[];
}

export interface BackupListItem {
  id: number;
  fileName: string;
  fileSize: number;
  checksum: string;
  sourceCount: number;
  storageLocations: StorageDestination[];
  isSafetyBackup: boolean;
  driveFileId: string | null;
  createdAt: Date;
  user: { fullName: string; email: string };
}

// ─── Constants ──────────────────────────────────────────────

const BACKUP_BASE_DIR = join(process.cwd(), "backups");

// ─── Helpers ────────────────────────────────────────────────

async function ensureBackupDir(companyId: number): Promise<string> {
  const dir = join(BACKUP_BASE_DIR, String(companyId));
  await mkdir(dir, { recursive: true });
  return dir;
}

function parseStorageLocations(raw: string): StorageDestination[] {
  return raw.split(",").filter(Boolean) as StorageDestination[];
}

function serializeStorageLocations(locations: StorageDestination[]): string {
  return locations.join(",");
}

// ─── Storage Service ────────────────────────────────────────

/**
 * Store encrypted backup data to one or more backends.
 *
 * - "db": stores encryptedData as blob in the Backup record
 * - "filesystem": writes file to /backups/{companyId}/{fileName}
 * - "drive": uploads via injected DriveUploader callback (graceful degradation)
 *
 * Always creates metadata record in DB. Returns which destinations succeeded.
 */
export async function storeBackup(
  db: PrismaClient,
  encryptedData: Buffer,
  companyId: number,
  userId: number,
  checksum: string,
  sourceCount: number,
  fileName: string,
  options: StoreOptions,
  driveUploader?: DriveUploader
): Promise<StoreResult> {
  const dir = await ensureBackupDir(companyId);
  const path = join(dir, fileName);
  await writeFile(path, encryptedData, { mode: 0o600 });
  return storeBackupFile(db, path, companyId, userId, checksum, sourceCount, fileName, options, driveUploader);
}

/** File-based persistence is shared by the streaming exporter and buffer callers.
 * Only small blobs enter Prisma; larger files stay streamed on the filesystem. */
export async function storeBackupFile(
  db: PrismaClient, filePath: string, companyId: number, userId: number, checksum: string,
  sourceCount: number, fileName: string, options: StoreOptions, driveUploader?: DriveUploader,
): Promise<StoreResult> {
  const { destinations, isSafetyBackup = false, isScheduled = false } = options;
  const size = (await stat(filePath)).size;
  const storedIn: StorageDestination[] = ["filesystem"];
  const warnings: string[] = [];
  let blob: Buffer | null = null, driveFileId: string | null = null;
  if (destinations.includes("db")) {
    if (size <= 8 * 1024 * 1024) { blob = await readFile(filePath); storedIn.push("db"); }
    else warnings.push("Large encrypted backup stored on the filesystem to keep database serialization within the memory budget.");
  }
  if (destinations.includes("drive")) {
    try {
      if (!driveUploader || !await driveUploader.isConnected(companyId)) warnings.push("Drive upload skipped: Google Drive not connected");
      else if (driveUploader.uploadPath) { driveFileId = await driveUploader.uploadPath(fileName, filePath, companyId); storedIn.push("drive"); }
      else if (size <= 8 * 1024 * 1024) { driveFileId = await driveUploader.upload(fileName, await readFile(filePath), companyId); storedIn.push("drive"); }
      else warnings.push("Drive upload needs a streaming adapter for this file. The encrypted filesystem recovery copy remains available.");
    } catch (error) { warnings.push(`Drive upload failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const backup = await db.backup.create({ data: {
    companyId, userId, fileName, filePath, fileSize: size, checksum, sourceCount,
    storageLocations: serializeStorageLocations(storedIn), isSafetyBackup, isScheduled,
    isComplete: destinations.every(destination => storedIn.includes(destination) || destination === "db" && storedIn.includes("filesystem")),
    encryptedData: blob ? new Uint8Array(blob) : null, driveFileId,
  } });
  return { backupId: backup.id, storedIn, warnings };
}

/**
 * Retrieve backup data from the first available storage location.
 * Priority: DB blob -> filesystem -> Drive.
 */
export async function retrieveBackup(
  db: PrismaClient,
  backupId: number,
  companyId: number,
  driveUploader?: DriveUploader
): Promise<Buffer> {
  // First fetch metadata only (no blob) to determine storage locations
  const meta = await db.backup.findFirst({
    where: { id: backupId, companyId },
    select: {
      id: true,
      storageLocations: true,
      filePath: true,
      driveFileId: true,
    },
  });

  if (!meta) {
    throw new Error("Backup not found");
  }

  const locations = parseStorageLocations(meta.storageLocations);

  // Try filesystem first (avoids loading large blob from DB)
  if (locations.includes("filesystem") && meta.filePath) {
    try {
      return await readFile(meta.filePath);
    } catch {
      // Fall through to next location
    }
  }

  // Try DB blob (separate query to load only when needed)
  if (locations.includes("db")) {
    const withBlob = await db.backup.findFirst({
      where: { id: backupId, companyId },
      select: { encryptedData: true },
    });
    if (withBlob?.encryptedData) {
      return Buffer.from(withBlob.encryptedData);
    }
  }

  // Try Drive
  if (locations.includes("drive") && meta.driveFileId && driveUploader) {
    try {
      return await driveUploader.download(meta.driveFileId, companyId);
    } catch {
      // Fall through
    }
  }

  throw new Error("Backup data not available from any storage location");
}

/**
 * Delete backup from all storage locations and remove DB record.
 */
export async function deleteBackup(
  db: PrismaClient,
  backupId: number,
  companyId: number,
  driveUploader?: DriveUploader
): Promise<void> {
  const backup = await db.backup.findFirst({
    where: { id: backupId, companyId },
    select: { id: true, storageLocations: true, filePath: true, driveFileId: true },
  });

  if (!backup) {
    throw new Error("Backup not found");
  }

  const locations = parseStorageLocations(backup.storageLocations);

  // Keep metadata until all external copies are deleted, so retention can retry.
  if (backup.filePath) {
    try { await unlink(backup.filePath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (locations.includes("drive") && backup.driveFileId) {
    if (!driveUploader) throw new Error("Drive adapter required to delete stored backup.");
    await driveUploader.delete(backup.driveFileId, companyId);
  }

  // Delete DB record last (authoritative)
  await db.backup.delete({ where: { id: backupId } });
}

/**
 * Rename backup metadata and any stored file locations.
 */
export async function renameBackup(
  db: PrismaClient,
  backupId: number,
  companyId: number,
  fileName: string,
  driveUploader?: DriveUploader
): Promise<void> {
  const backup = await db.backup.findFirst({
    where: { id: backupId, companyId },
    select: {
      id: true,
      filePath: true,
      driveFileId: true,
      storageLocations: true,
    },
  });

  if (!backup) {
    throw new Error("Backup not found");
  }

  const locations = parseStorageLocations(backup.storageLocations);
  let nextFilePath = backup.filePath;

  if (locations.includes("filesystem") && backup.filePath) {
    const nextPath = join(BACKUP_BASE_DIR, String(companyId), fileName);
    await renameFile(backup.filePath, nextPath);
    nextFilePath = nextPath;
  }

  if (locations.includes("drive") && backup.driveFileId && driveUploader) {
    await driveUploader.rename(backup.driveFileId, fileName, companyId);
  }

  await db.backup.update({
    where: { id: backupId },
    data: {
      fileName,
      filePath: nextFilePath,
    },
  });
}

/**
 * List all backups for a company with parsed storage locations.
 */
export async function listBackups(
  db: PrismaClient,
  companyId: number
): Promise<BackupListItem[]> {
  const backups = await db.backup.findMany({
    where: { companyId },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      checksum: true,
      sourceCount: true,
      storageLocations: true,
      isSafetyBackup: true,
      driveFileId: true,
      createdAt: true,
      user: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return backups.map((b) => ({
    ...b,
    storageLocations: parseStorageLocations(b.storageLocations),
  }));
}

/**
 * Delete oldest backups beyond keepCount from all storage locations.
 * Returns number of backups deleted.
 */
export async function cleanupOldBackups(
  db: PrismaClient,
  companyId: number,
  keepCount: number,
  driveUploader?: DriveUploader
): Promise<number> {
  const allBackups = await db.backup.findMany({
    where: { companyId },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  if (allBackups.length <= keepCount) {
    return 0;
  }

  const toDelete = allBackups.slice(keepCount);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      await deleteBackup(db, backup.id, companyId, driveUploader);
      deleted++;
    } catch {
      // Continue with next — best effort cleanup
    }
  }

  return deleted;
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
