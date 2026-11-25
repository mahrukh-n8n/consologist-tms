/** Shared wire encoding for encryption and checksums; preserves legacy key order. */
import type { BackupData, BackupManifest } from "../registry/types";

export class BackupCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupCapacityError";
  }
}

function stringify(value: unknown, bigintMode: "tagged" | "string"): string {
  try {
    return JSON.stringify(value, (_key, item) => typeof item === "bigint"
      ? bigintMode === "tagged" ? { __bigint: item.toString() } : item.toString()
      : item);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BackupCapacityError("A backup record exceeds this server's serialization capacity. Reduce the size of the individual record; no restore data has been replaced.");
    }
    throw error;
  }
}

export function* serializeBackup(
  backup: { manifest: BackupManifest | Omit<BackupManifest, "checksum">; data: BackupData["data"] },
  bigintMode: "tagged" | "string",
): Generator<string> {
  yield '{"manifest":';
  yield stringify(backup.manifest, bigintMode);
  yield ',"data":{';
  let first = true;
  for (const key of Object.keys(backup.data)) {
    if (!first) yield ",";
    first = false;
    yield JSON.stringify(key);
    yield ":[";
    const rows = backup.data[key] ?? [];
    for (let index = 0; index < rows.length; index++) {
      if (index) yield ",";
      yield stringify(rows[index], bigintMode);
    }
    yield "]";
  }
  yield "}}";
}
