/**
 * Export service — orchestrates full backup creation.
 *
 * Calls all registered data sources, builds manifest, encrypts, stores.
 * Portable — uses only module-internal imports.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DiskDataset } from "../storage/disk-dataset";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DataSourceRegistry } from "../registry/data-source-registry";
import type {
  BackupData,
  BackupManifest,
  StorageDestination,
} from "../registry/types";
import { calculateChecksum } from "../encryption/checksum";
import { encryptBackupFile } from "../encryption/file-encryption";
import { storeBackupFile, type DriveUploader } from "./storage-service";

// ─── Types ──────────────────────────────────────────────────

export interface ExportOptions {
  companyId: number;
  userId: number;
  password: string;
  destinations: StorageDestination[];
  isSafetyBackup?: boolean;
  isScheduled?: boolean;
  driveUploader?: DriveUploader;
  appVersion?: string;
  requireComplete?: boolean;
  workDirectory?: string;
  /** Internal restore safety fallback, populated only after incoming checksum verification. */
  safetyRecovery?: { data: Record<string, unknown[]>; password: string };
}

export interface ExportResult {
  backupId: number;
  sourceCount: number;
  totalRows: number;
  fileSize: number;
  sourceSizes: Record<string, { rowCount: number; estimatedJsonBytes: number }>;
  storedIn: StorageDestination[];
  warnings: string[];
}

function estimateRowsJsonBytes(rows: unknown[]): number {
  if (rows.length === 0) return 2;
  let bytes = 2;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) bytes += 1;
    bytes += Buffer.byteLength(JSON.stringify(rows[i], bigintReplacer), "utf8");
  }
  return bytes;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

// ─── Export Orchestrator ────────────────────────────────────

/**
 * Create a full backup of all registered data sources.
 *
 * Steps:
 * 1. Validate password
 * 2. Export each source sequentially into a private disk spool
 * 3. Build manifest with metadata
 * 4. Calculate checksum
 * 5. Encrypt with password
 * 6. Store to requested destinations
 */
export async function createBackup(
  db: PrismaClient,
  registry: DataSourceRegistry,
  options: ExportOptions,
): Promise<ExportResult> {
  const {
    companyId,
    userId,
    password,
    destinations,
    isSafetyBackup = false,
    isScheduled = false,
    driveUploader,
    appVersion,
  } = options;

  // 1. Validate password
  if (!password || password.length < 8) {
    throw new Error("Backup password must be at least 8 characters");
  }

  // 2. Get all registered sources
  const sources = registry.getAll();
  if (sources.length === 0) {
    throw new Error("No data sources registered");
  }

  // 3. Spool sources sequentially; safety backups require every source to succeed.
  const warnings: string[] = [];
  const data: Record<string, unknown[]> = {};
  const sourcesMeta: BackupManifest["sources"] = {};
  const sourceSizes: ExportResult["sourceSizes"] = {};

  const spool = new DiskDataset(options.workDirectory);
  try {
  for (const source of sources) {
    try {
      const recovery = options.safetyRecovery ? { rows: options.safetyRecovery.data[source.key] ?? [], password: options.safetyRecovery.password } : undefined;
      if (source.exportBatches) {
        for await (const batch of source.exportBatches(db, companyId, password, recovery)) for (const row of batch) spool.append(source.key, row);
      } else {
        const rows = source.exportForBackup ? await source.exportForBackup(db, companyId, password, recovery) : await source.export(db, companyId);
        for (const row of rows) spool.append(source.key, row);
      }
      const rows = spool.array(source.key);
      const estimatedJsonBytes = estimateRowsJsonBytes(rows);
      data[source.key] = rows;
      sourcesMeta[source.key] = { version: source.version ?? 1, rowCount: rows.length, estimatedJsonBytes, group: source.group, displayName: source.displayName };
      sourceSizes[source.key] = { rowCount: rows.length, estimatedJsonBytes };
    } catch (error) {
      if (source.exportForBackup) throw new Error(`Backup incomplete: required export failed (${source.key}). ${String(error)}`);
      warnings.push(`Export failed for "${source.key}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (options.requireComplete && warnings.length) {
    throw new Error(`Backup export incomplete: ${warnings.join("; ")}`);
  }

  // 4. Fetch company name for manifest
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  // 5. Build manifest (without checksum first)
  const manifestWithoutChecksum = {
    version: "2.0.0",
    appVersion,
    compression: "gzip" as const,
    companyId,
    companyName: company?.name ?? "Unknown",
    exportedAt: new Date().toISOString(),
    exportedBy: userId,
    sourceCount: Object.keys(sourcesMeta).length,
    sources: sourcesMeta,
  };

  // 6. Calculate checksum on data + manifest (without checksum field)
  const checksum = calculateChecksum({
    manifest: manifestWithoutChecksum,
    data,
  });

  // 7. Build full BackupData
  const backupData: BackupData = {
    manifest: { ...manifestWithoutChecksum, checksum },
    data,
  };

  // 8. Encrypt

  // 9. Generate filename and store
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  const fileName = `backup-${companyId}-${timestamp}-${randomUUID()}.enc`;

  const directory = join(process.cwd(), "backups", String(companyId));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = join(directory, fileName);
  const fileSize = await encryptBackupFile(backupData, password, filePath);
  const storeResult = await storeBackupFile(
    db,
    filePath,
    companyId,
    userId,
    checksum,
    Object.keys(sourcesMeta).length,
    fileName,
    { destinations, isSafetyBackup, isScheduled },
    driveUploader,
  );

  // Merge storage warnings
  warnings.push(...storeResult.warnings);

  // 10. Calculate total rows
  const totalRows = Object.values(data).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );

  return {
    backupId: storeResult.backupId,
    sourceCount: Object.keys(sourcesMeta).length,
    totalRows,
    fileSize,
    sourceSizes,
    storedIn: storeResult.storedIn,
    warnings,
  };
  } finally { spool.dispose(); }
}
