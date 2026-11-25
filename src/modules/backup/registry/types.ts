/**
 * Backup module types — portable, zero app imports.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export type BackupId = number | string;
export type BackupIdMaps = Record<string, Map<BackupId, BackupId>>;

/** Verified incoming rows may recover matching external bytes for a safety export. */
export interface BackupRecoveryContext {
  rows: unknown[];
  password: string;
}

export interface BackupReference {
  path: (string | number)[];
  target: string;
  id: number;
}

// DataSource interface — what apps register
export interface DataSource {
  key: string;
  identityType?: "number" | "string";
  /** Explicitly rebuildable cache fields omitted when staging legacy backups. */
  rebuildableFields?: readonly string[];
  displayName: string;
  group: string;
  dependsOn: string[];
  writeReferencePatch?: (
    db: PrismaClient,
    companyId: number,
    id: BackupId,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  restoreWarnings?: (rows: unknown[]) => string[];
  references?: (row: Record<string, unknown>) => BackupReference[];
  remapReferencePath?: (
    path: (string | number)[],
    maps: BackupIdMaps,
  ) => (string | number)[];
  export: (db: PrismaClient, companyId: number) => Promise<unknown[]>;
  /** Bounded database export preserving the source's exact tenant/projection rules. */
  exportBatches?: (db: PrismaClient, companyId: number, password?: string, recovery?: BackupRecoveryContext) => AsyncIterable<unknown[]>;
  /** External asset hooks: called outside the destructive restore transaction. */
  exportForBackup?: (
    db: PrismaClient,
    companyId: number,
    password: string,
    recovery?: BackupRecoveryContext,
  ) => Promise<unknown[]>;
  prepareRestore?: (
    db: PrismaClient,
    companyId: number,
    rows: unknown[],
    password: string,
    dataset: Record<string, unknown[]>,
  ) => Promise<void>;
  import: (
    db: PrismaClient,
    companyId: number,
    rows: unknown[],
    idMaps: BackupIdMaps,
  ) => Promise<void>;
  postImport?: (
    db: PrismaClient,
    companyId: number,
    idMaps: BackupIdMaps,
  ) => Promise<void>;
  count: (db: PrismaClient, companyId: number) => Promise<number>;
  clear: (db: PrismaClient, companyId: number) => Promise<void>;
  version?: number;
  migrate?: (fromVersion: number, data: unknown[]) => unknown[];
}

// BackupManifest — metadata embedded in every backup file
export interface BackupManifest {
  version: string;
  appVersion?: string;
  compression?: "gzip";
  companyId: number;
  companyName: string;
  exportedAt: string;
  exportedBy: number;
  sourceCount: number;
  sources: Record<
    string,
    {
      version: number;
      rowCount: number;
      estimatedJsonBytes?: number;
      group: string;
      displayName: string;
    }
  >;
  checksum: string;
}

// BackupData — full backup payload
export interface BackupData {
  manifest: BackupManifest;
  data: Record<string, unknown[]>;
}

// RestoreOptions
export interface RestoreOptions {
  mode: "full" | "selective";
  selectedSourceKeys?: string[];
  skipMissingSources?: boolean;
}

// RestorePreview
export interface RestorePreview {
  manifest: BackupManifest;
  currentCounts: Record<string, number>;
  missingSources: string[];
  extraSources: string[];
  resolvedDependencies?: string[];
  warnings?: string[];
  referenceIssues?: import("../services/reference-integrity").ReferenceIssue[];
}

// StorageDestination
export type StorageDestination = "db" | "filesystem" | "drive";

// BackupMetadata — what we store in the DB about each backup
export interface BackupMetadata {
  id: number;
  companyId: number;
  userId: number;
  fileName: string;
  fileSize: number;
  checksum: string;
  sourceCount: number;
  storageLocations: StorageDestination[];
  createdAt: Date;
  isSafetyBackup: boolean;
}
