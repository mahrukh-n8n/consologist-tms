import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { BackupIdMaps } from "../registry/types";
import { rowBatches } from "../storage/disk-dataset";
/** Large ID evidence is retained as bounded audit parts plus one completion anchor.
 * Every part is inserted in the caller's restore transaction. */
export async function writeRestoreManifest(db: PrismaClient, input: {
  companyId: number; userId: number; checksum: string; maps: BackupIdMaps;
  externalAssetMaps: unknown[]; chunked: boolean;
}) {
  const create = (newValues: unknown) => db.auditLog.create({ data: {
    companyId: input.companyId, userId: input.userId, tableName: "backup_restore", recordId: input.companyId,
    action: "RESTORE_REFERENCE_MANIFEST", newValues: newValues as Prisma.InputJsonValue,
  } });
  const common = { backupChecksum: input.checksum, restoredAt: new Date().toISOString() };
  if (!input.chunked) {
    await create({ version: 1, ...common, externalAssetMaps: input.externalAssetMaps,
      idMaps: Object.fromEntries(Object.entries(input.maps).map(([key, map]) => [key, Object.fromEntries(map)])) });
    return;
  }
  const restoreId = randomUUID(), hash = createHash("sha256"); let chunkCount = 0;
  const write = async (part: unknown) => { hash.update(JSON.stringify(part, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)); await create({ version: 2, restoreId, chunk: chunkCount++, ...part as object }); };
  const sourceCounts: Record<string, number> = {};
  for (const [source, map] of Object.entries(input.maps)) {
    sourceCounts[source] = map.size;
    let entries: Array<[number | string, number | string]> = [];
    for (const entry of map) {
      entries.push(entry);
      if (entries.length === 1000) { await write({ part: "id-map", source, entries }); entries = []; }
    }
    if (entries.length) await write({ part: "id-map", source, entries });
  }
  for (const batch of rowBatches(input.externalAssetMaps)) await write({ part: "external-assets", entries: batch.rows });
  await create({ version: 2, restoreId, part: "complete", ...common, sourceCounts, chunkCount, partsChecksum: hash.digest("hex") });
}
