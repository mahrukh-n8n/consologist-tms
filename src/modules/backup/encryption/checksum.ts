/**
 * Backup checksum — SHA-256 integrity verification.
 * Portable — uses only Node.js crypto built-in.
 *
 * Uses incremental hashing to avoid creating a single massive string
 * from the entire backup payload (which can exceed V8's ~512MB string limit).
 */
import { createHash } from "crypto";
import type { BackupData, BackupManifest } from "../registry/types";
import { serializeBackup } from "./serialization";

/**
 * Calculate SHA-256 checksum of the data portion of a backup.
 * The checksum field itself is excluded from the manifest during calculation.
 *
 * Feeds data to the hash incrementally per source key to avoid building
 * a single string that could exceed V8's max string length.
 */
export function calculateChecksum(
  data: Omit<BackupData, "manifest"> & {
    manifest: Omit<BackupManifest, "checksum">;
  }
): string {
  const hash = createHash("sha256");

  for (const chunk of serializeBackup(data, "string")) hash.update(chunk);

  return hash.digest("hex");
}

/**
 * Verify that a backup's checksum matches its data.
 * Returns true if valid, false if corrupted.
 */
const staged = new WeakMap<BackupData, { original: string; normalized: string }>();
/** Called only after ciphertext authentication and token-wise original checksum verification. */
export function markVerifiedArchive(data: BackupData) {
  const { checksum, ...manifest } = data.manifest;
  staged.set(data, { original: checksum, normalized: calculateChecksum({ manifest, data: data.data }) });
}
export function verifyChecksum(data: BackupData): boolean {
  const { checksum, ...manifestWithoutChecksum } = data.manifest;
  const dataForChecksum = {
    manifest: manifestWithoutChecksum,
    data: data.data,
  };

  const computed = calculateChecksum(dataForChecksum);
  const verified = staged.get(data);
  return computed === checksum || !!verified && verified.original === checksum && verified.normalized === computed;
}
