import { writeRestoreManifest } from "./restore-manifest";
import { lookupRows, DiskDataset, diskRows, rowBatches } from "../storage/disk-dataset";
import type { BackupIdMaps } from "../registry/types";
/**
 * Import service — preview and execute restore from encrypted backups.
 *
 * Restores atomically in dependency order within a single transaction.
 * Creates mandatory safety backup before any data modification.
 * Portable — uses only module-internal imports.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { DataSourceRegistry } from "../registry/data-source-registry";
import type {
  BackupData,
  RestoreOptions,
  RestorePreview,
  StorageDestination,
} from "../registry/types";
import { decryptBackup } from "../encryption/encrypt";
import { verifyChecksum } from "../encryption/checksum";
import { createBackup, type ExportOptions } from "./export-service";
import type { DriveUploader } from "./storage-service";

import {
  auditReferences,
  assertReferenceIntegrity,
  verifyRestoredReferences,
  normalizeRestoredReferences,
  collectReferences,
  type Dataset,
} from "./reference-integrity";

const RESTORE_TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;
const RESTORE_TRANSACTION_MAX_WAIT_MS = 30 * 1000;

// ─── Types ──────────────────────────────────────────────────

export interface PreviewOptions {
  encryptedData: Buffer;
  password: string;
  backupData?: BackupData;
}

export interface RestoreExecuteOptions {
  db: PrismaClient;
  registry: DataSourceRegistry;
  encryptedData: Buffer;
  password: string;
  restoreOptions: RestoreOptions;
  companyId: number;
  userId: number;
  safetyBackupPassword: string;
  safetyBackupDestinations: StorageDestination[];
  driveUploader?: DriveUploader;
  onProgress?: (source: string, index: number, total: number) => void | Promise<void>;
  onStage?: (message: string) => void | Promise<void>;
  backupData?: BackupData;
  rowStore?: DiskDataset;
  /** Persist the completion outcome on the same transaction as restored rows. */
  onCommit?: (tx: PrismaClient, result: RestoreResult) => Promise<void>;
}

export interface RestoreResult {
  restoredSources: number;
  warnings: string[];
}

// ─── Preview ────────────────────────────────────────────────

/**
 * Preview what a restore would do without modifying any data.
 *
 * 1. Decrypt and verify checksum
 * 2. Compare backup sources vs registered sources
 * 3. Get current row counts for comparison
 * 4. If selective: resolve transitive dependencies
 */
export async function previewRestore(
  registry: DataSourceRegistry,
  options: PreviewOptions,
  db: PrismaClient,
  companyId: number,
): Promise<RestorePreview> {
  const { encryptedData, password } = options;

  // 1. Decrypt
  const backupData = options.backupData ?? await decryptBackup(encryptedData, password);

  // 2. Verify checksum
  if (!verifyChecksum(backupData)) {
    throw new Error("Backup integrity check failed: checksum mismatch");
  }

  // 3. Compare sources
  const backupSourceKeys = new Set(Object.keys(backupData.manifest.sources));
  const registeredSources = registry.getAll();
  const registeredKeys = new Set(registeredSources.map((s) => s.key));

  const missingSources = Array.from(backupSourceKeys).filter(
    (k) => !registeredKeys.has(k),
  );
  const extraSources = Array.from(registeredKeys).filter(
    (k) => !backupSourceKeys.has(k),
  );

  // 4. Get current counts
  const currentCounts: Record<string, number> = {};
  for (const source of registeredSources) {
    if (backupSourceKeys.has(source.key)) {
      currentCounts[source.key] = await source.count(db, companyId);
    }
  }

  return {
    manifest: backupData.manifest,
    currentCounts,
    missingSources,
    extraSources,
    warnings: registeredSources.flatMap(
      (source) =>
        source.restoreWarnings?.(backupData.data[source.key] ?? []) ?? [],
    ),
    ...(registry.referenceIntegrityRequired
      ? {
          referenceIssues: auditReferences(
            registeredSources.filter((s) => backupSourceKeys.has(s.key)),
            backupData.data,
          ),
        }
      : {}),
  };
}

// ─── Execute Restore ────────────────────────────────────────

/**
 * Execute a full or selective restore from an encrypted backup.
 *
 * 1. Decrypt and verify
 * 2. Create mandatory safety backup
 * 3. Determine sources to restore (with dependency resolution)
 * 4. Execute atomically in a single transaction:
 *    a. Clear in REVERSE dependency order (children first)
 *    b. Import in FORWARD dependency order (parents first)
 * 5. Full rollback on any failure
 */
export async function executeRestore(
  options: RestoreExecuteOptions,
): Promise<RestoreResult> {
  const {
    db,
    registry,
    encryptedData,
    password,
    restoreOptions,
    companyId,
    userId,
    safetyBackupPassword,
    safetyBackupDestinations,
    driveUploader,
    onProgress,
    onStage,
    onCommit,
  } = options;

  // 1. Decrypt and verify
  await onStage?.("Decrypting and checking backup");
  const backupData = options.backupData ?? await decryptBackup(encryptedData, password);
  if (!verifyChecksum(backupData)) {
    throw new Error("Backup integrity check failed: checksum mismatch");
  }

  // 2. Create mandatory safety backup before modifying any data
  await onStage?.("Creating the recoverable safety backup");
  try {
    const safetyOptions: ExportOptions = {
      companyId,
      userId,
      password: safetyBackupPassword,
      destinations: safetyBackupDestinations,
      isSafetyBackup: true,
      requireComplete: true,
      workDirectory: options.rowStore?.directory,
      safetyRecovery: { data: backupData.data, password },
      driveUploader,
    };
    const safetyBackup = await createBackup(db, registry, safetyOptions);
    if (safetyBackup.storedIn.length === 0) {
      throw new Error(
        "No recoverable safety backup was stored. Check the selected storage destinations.",
      );
    }
  } catch (err) {
    throw new Error(
      `Cannot create safety backup: ${err instanceof Error ? err.message : String(err)}. Restore aborted.`,
    );
  }

  // 3. Determine which sources to restore
  const warnings: string[] = [];
  let sourceKeysToRestore: string[];

  if (
    restoreOptions.mode === "selective" &&
    restoreOptions.selectedSourceKeys
  ) {
    // Resolve transitive dependencies
    sourceKeysToRestore = registry.resolveDependenciesFor(
      restoreOptions.selectedSourceKeys,
    );
  } else {
    // Full restore — all sources in backup that are registered
    sourceKeysToRestore = Object.keys(backupData.manifest.sources);
  }

  // Filter out sources not registered (missing)
  const finalKeys: string[] = [];
  for (const key of sourceKeysToRestore) {
    const source = registry.getByKey(key);
    if (!source) {
      if (!restoreOptions.skipMissingSources)
        throw new Error(
          `Restore blocked: unregistered backup source "${key}".`,
        );
      warnings.push(`Skipping "${key}": not registered in current application`);
      continue;
    }
    if (!backupData.data[key] && restoreOptions.mode === "full") {
      // Source registered but not in backup data — skip with warning
      warnings.push(`Skipping "${key}": no data in backup`);
      continue;
    }
    finalKeys.push(key);
  }

  // 4. Get import order (forward dependency order: parents first)
  const resolvedSources = registry.resolveImportOrder(finalKeys);
  const hasData = (key: string) =>
    Object.prototype.hasOwnProperty.call(backupData.data, key);
  // Never turn an absent optional dependency into an empty destructive restore.
  // Older backups may omit a newer table if no incoming row references it.
  for (const source of resolvedSources.filter(
    (source) => !hasData(source.key),
  )) {
    const referenced =
      registry.referenceIntegrityRequired &&
      resolvedSources
        .filter((s) => hasData(s.key))
        .some((s) =>
          backupData.data[s.key]!.some((row) =>
            collectReferences(s, row).some((ref) => ref.target === source.key),
          ),
        );
    if (
      !registry.referenceIntegrityRequired ||
      finalKeys.includes(source.key) ||
      referenced
    ) {
      throw new Error(
        `Restore blocked: required source "${source.key}" is absent from backup.`,
      );
    }
    warnings.push(
      `Preserving omitted dependency "${source.key}"; no incoming row references it.`,
    );
  }
  const orderedSources = resolvedSources.filter((source) =>
    hasData(source.key),
  );

  // 5. Run version migrations if needed
  const migratedData = migrateSourceData(backupData, orderedSources, warnings);
  warnings.push(
    ...orderedSources.flatMap(
      (source) =>
        source.restoreWarnings?.(migratedData[source.key] ?? []) ?? [],
    ),
  );

  if (registry.referenceIntegrityRequired) {
    assertReferenceIntegrity(auditReferences(orderedSources, migratedData));
  }

  // External media is verified/recovered before any database clear. The hooks
  // operate on a copy; all live database identities are still remapped below.
  const originalExternalAssets = (migratedData["media-assets"] ?? []).map(raw => { const row = raw as { id: number; assetKey: string; driveFileId: string | null }; return { id: row.id, assetKey: row.assetKey, driveFileId: row.driveFileId }; }) as { id: number; assetKey: string; driveFileId: string | null }[];
  for (const source of orderedSources) {
    if (source.prepareRestore) {
      const rows = migratedData[source.key] ?? [];
      for (const batch of rowBatches(rows)) {
        await source.prepareRestore(db, companyId, batch.rows, password, migratedData);
        if (diskRows(rows)) for (let index = 0; index < batch.rows.length; index++) rows[batch.start + index] = batch.rows[index];
      }
    }
  }

  // 6. Execute atomically in a single transaction
  await onStage?.("Checking dependencies and preparing the restore transaction");
  const total = orderedSources.length;

  const readBackStore = options.rowStore ? new DiskDataset(options.rowStore.directory) : undefined;
  try {
  await db.$transaction(
    async (tx) => {
      const txClient = tx as unknown as PrismaClient;

      // Reject selective restores that would strand references in retained tables.
      // This must run under the same transaction/snapshot as the destructive work.
      if (registry.referenceIntegrityRequired) {
        const selected = new Set(orderedSources.map((s) => s.key));
        for (const source of registry
          .getAll()
          .filter((s) => !selected.has(s.key))) {
          const batches = source.exportBatches ? source.exportBatches(txClient, companyId)
            : (async function* () { yield await source.export(txClient, companyId); })();
          for await (const batch of batches) for (const row of batch) {
            if (collectReferences(source, row).some(ref => selected.has(ref.target))) {
              throw new Error(`Restore blocked: retained source "${source.key}" references restored data. Include it in the restore.`);
            }
          }
        }
      }

      // 6a. Clear in REVERSE dependency order (children first, parents last)
      const reverseOrder = [...orderedSources].reverse();
      for (const source of reverseOrder) {
        await source.clear(txClient, companyId);
      }

      // 6b. Import in FORWARD dependency order (parents first, children last)
      // idMaps tracks old ID -> new ID mappings per source for FK resolution
      const idMaps: BackupIdMaps = options.rowStore?.maps() ?? {};
      for (let i = 0; i < orderedSources.length; i++) {
        const source = orderedSources[i]!;
        const rows = migratedData[source.key] ?? [];
        if (!rows.length) await source.import(txClient, companyId, [], idMaps);
        for (const batch of rowBatches(rows)) {
          await source.import(txClient, companyId, structuredClone(batch.rows), idMaps);
          await onStage?.(`Restoring ${source.displayName}: ${batch.start + batch.rows.length} of ${rows.length} rows`);
        }
        await onProgress?.(source.key, i + 1, total);
      }

      await onStage?.("Verifying restored references and saving the outcome");
      // 6c. Run deferred repair hooks after all source ID maps exist.
      // Some sources store denormalized JSON snapshots with embedded IDs that
      // cannot be remapped during their own import because child rows are
      // restored later in dependency order.
      for (const source of orderedSources) {
        if (source.postImport) {
          await source.postImport(txClient, companyId, idMaps);
        }
      }
      if (registry.referenceIntegrityRequired) {
        const readBack = async (): Promise<Dataset> => {
          const result: Dataset = {};
          for (const source of orderedSources) {
            if (readBackStore && source.exportBatches) {
              readBackStore.reset(source.key);
              for await (const batch of source.exportBatches(txClient, companyId)) for (const row of batch) readBackStore.append(source.key, row);
              result[source.key] = readBackStore.array(source.key);
            } else result[source.key] = await source.export(txClient, companyId);
          }
          return result;
        };
        await normalizeRestoredReferences(
          orderedSources,
          migratedData,
          await readBack(),
          idMaps,
          txClient,
          companyId,
        );
        const saved = await readBack();
        assertReferenceIntegrity(auditReferences(orderedSources, saved));
        assertReferenceIntegrity(
          verifyRestoredReferences(orderedSources, migratedData, saved, idMaps),
        );
        // The manifest is written atomically with the restored rows, and retained
        // outside the normal audit-log restore clear/export cycle.
        const assets = lookupRows(migratedData["media-assets"] ?? []);
        await writeRestoreManifest(txClient, {
          companyId, userId, checksum: backupData.manifest.checksum, maps: idMaps, chunked: !!options.rowStore,
          externalAssetMaps: originalExternalAssets.map(original => ({
            assetKey: original.assetKey, originalDriveFileId: original.driveFileId,
            restoredDriveFileId: (assets.get(original.id) as { driveFileId?: string | null } | undefined)?.driveFileId ?? null,
          })),
        });
      }
      await onCommit?.(txClient, { restoredSources: orderedSources.length, warnings });
    },
    {
      isolationLevel: "Serializable",
      maxWait: RESTORE_TRANSACTION_MAX_WAIT_MS,
      timeout: RESTORE_TRANSACTION_TIMEOUT_MS,
    },
  );

  return {
    restoredSources: orderedSources.length,
    warnings,
  };
  } finally { readBackStore?.dispose(); }
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Run version migrations on source data if source version in backup
 * is older than current registered version.
 */
function migrateSourceData(
  backupData: BackupData,
  sources: {
    key: string;
    version?: number;
    migrate?: (fromVersion: number, data: unknown[]) => unknown[];
  }[],
  warnings: string[],
): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};

  for (const source of sources) {
    const rows = backupData.data[source.key] ?? [];
    const backupVersion = backupData.manifest.sources[source.key]?.version ?? 1;
    const currentVersion = source.version ?? 1;

    if (backupVersion < currentVersion && source.migrate) {
      try {
        result[source.key] = source.migrate(backupVersion, rows);
      } catch (err) {
        warnings.push(
          `Migration failed for "${source.key}" (v${backupVersion} -> v${currentVersion}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new Error(
          `Restore aborted: migration failed for "${source.key}". Unmigrated data will not be imported.`,
        );
      }
    } else {
      result[source.key] = rows;
    }
  }

  return result;
}
