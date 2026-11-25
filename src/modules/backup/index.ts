/**
 * backup module — public API
 *
 * Server-only — do NOT import from "use client" components.
 * For client components, import from "@/modules/backup/client" instead.
 *
 * This module is portable: it has ZERO imports from app business logic.
 */

// ── Types ───────────────────────────────────────────────────
export * from "./registry/types";

// ── Registry ────────────────────────────────────────────────
export {
  DataSourceRegistry,
  dataSourceRegistry,
} from "./registry/data-source-registry";

// ── Encryption ──────────────────────────────────────────────
export {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
} from "./encryption/encrypt";

// ── Checksum ────────────────────────────────────────────────
export { calculateChecksum, verifyChecksum } from "./encryption/checksum";

// ── Services ───────────────────────────────────────────────
export { createBackup } from "./services/export-service";
export type { ExportOptions, ExportResult } from "./services/export-service";

export { previewRestore, executeRestore } from "./services/import-service";
export type {
  PreviewOptions,
  RestoreExecuteOptions,
  RestoreResult,
} from "./services/import-service";

export {
  storeBackup,
  retrieveBackup,
  deleteBackup,
  renameBackup,
  listBackups,
  cleanupOldBackups,
  formatFileSize,
} from "./services/storage-service";
export type { DriveUploader } from "./services/storage-service";

export { runScheduledBackup } from "./services/schedule-service";
