/**
 * backup module — CLIENT-SAFE entry point
 *
 * Import from "@/modules/backup/client" in any "use client" component.
 * This barrel contains NO server-only dependencies (no Node.js built-ins).
 *
 * For server components and server actions, import from "@/modules/backup".
 */

// Types only — safe for "use client" components
export type {
  DataSource,
  BackupManifest,
  BackupData,
  RestoreOptions,
  RestorePreview,
  StorageDestination,
  BackupMetadata,
} from "./registry/types";
