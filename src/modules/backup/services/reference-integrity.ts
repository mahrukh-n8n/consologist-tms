import type { DataSource, BackupReference, BackupId, BackupIdMaps } from "../registry/types";

import { lookupRows, seenIdentities } from "../storage/disk-dataset";

export type Dataset = Record<string, unknown[]>;
export type IdMaps = BackupIdMaps;
export interface ReferenceIssue {
  source: string;
  rowId: BackupId;
  path: string;
  target?: string;
  oldId?: number;
  expectedId?: BackupId;
  actualId?: unknown;
  reason: string;
}
// Invalid archives can contain millions of broken links. Retain enough evidence
// to explain/reject them without building an unbounded error response in RAM.
function recordIssue(issues: ReferenceIssue[], issue: ReferenceIssue) {
  if (issues.length < 100) issues.push(issue);
}
const row = (value: unknown) => value as Record<string, unknown>;
export function valueAt(value: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((v, key) => v != null && typeof v === "object"
    ? (v as Record<string | number, unknown>)[key] : undefined, value);
}
export function collectReferences(source: DataSource, value: unknown): BackupReference[] {
  if (!source.references) throw new Error(`No reference contract for ${source.key}`);
  return source.references(row(value));
}

/** Tenant-scoped datasets only. Existence alone cannot establish historical identity. */
export function auditReferences(sources: DataSource[], data: Dataset): ReferenceIssue[] {
  const ids = new Map(Object.entries(data).map(([key, rows]) =>
    [key, lookupRows(rows)]));
  const issues: ReferenceIssue[] = [];
  for (const source of sources) {
    const seen = seenIdentities(data[source.key] ?? []);
    for (const value of data[source.key] ?? []) {
      const id = row(value).id as BackupId;
      if (!(source.identityType === "string" ? typeof id === "string" && id.length > 0 : Number.isSafeInteger(id) && Number(id) > 0) || seen.has(id)) {
        recordIssue(issues, { source: source.key, rowId: id, path: "id", reason: "Missing or duplicate row identity" });
      }
      seen.add(id);
      try {
        for (const ref of collectReferences(source, value)) {
          if (!ids.get(ref.target)?.has(ref.id)) recordIssue(issues, { source: source.key, rowId: id,
            path: ref.path.join("."), target: ref.target, oldId: ref.id,
            reason: "Referenced record is absent from this company dataset" });
        }
      } catch (error) {
        recordIssue(issues, { source: source.key, rowId: id, path: "", reason: String(error) });
      }
    }
  }
  return issues;
}

/** Compare the actual saved links with the original links translated through the
 * restore map. Detects stale IDs even when they happen to name another valid row. */
export function verifyRestoredReferences(
  sources: DataSource[], before: Dataset, after: Dataset, maps: IdMaps,
): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  for (const source of sources) {
    const saved = lookupRows(after[source.key] ?? []);
    const mapped = seenIdentities(after[source.key] ?? []);
    for (const original of before[source.key] ?? []) {
      const oldId = row(original).id as BackupId;
      const id = maps[source.key]?.get(oldId);
      const restored = id == null ? undefined : saved.get(id);
      if (!restored || mapped.has(id!)) {
        recordIssue(issues, { source: source.key, rowId: oldId, path: "id", reason: "Missing or non-unique restored identity" });
        continue;
      }
      mapped.add(id!);
      for (const ref of collectReferences(source, original)) {
        const expected = maps[ref.target]?.get(ref.id);
        const path = source.remapReferencePath?.(ref.path, maps) ?? ref.path;
        const actual = valueAt(restored, path);
        if (expected == null || actual !== expected) recordIssue(issues, { source: source.key, rowId: id!,
          path: path.join("."), target: ref.target, oldId: ref.id, expectedId: expected, actualId: actual,
          reason: expected == null ? "Missing restore ID mapping" : "Saved reference differs from restore mapping" });
      }
    }
  }
  return issues;
}
export function assertReferenceIntegrity(issues: ReferenceIssue[]): void {
  if (issues.length) throw new Error(`Restore blocked: ${issues.length} reference integrity issue(s). ` +
    issues.slice(0, 10).map(i => `${i.source}[${i.rowId}].${i.path}: ${i.reason}`).join("; "));
}

/** Authoritative mapping pass for declared references, including plain integers
 * and JSON. Runs after custom imports, inside the restore transaction. */
export async function normalizeRestoredReferences(
  sources: DataSource[], before: Dataset, after: Dataset, maps: IdMaps,
  db: import("@/generated/prisma/client").PrismaClient, companyId: number,
): Promise<void> {
  for (const source of sources) {
    const saved = lookupRows(after[source.key] ?? []);
    for (const original of before[source.key] ?? []) {
      const id = maps[source.key]?.get(row(original).id as BackupId);
      const current = id == null ? undefined : saved.get(id);
      if (!current) throw new Error(`Missing restored row: ${source.key}[${row(original).id}]`);
      const patch: Record<string, unknown> = {};
      for (const ref of collectReferences(source, original)) {
        const expected = maps[ref.target]?.get(ref.id);
        if (expected == null) throw new Error(`Missing ID mapping: ${ref.target}[${ref.id}]`);
        const path = source.remapReferencePath?.(ref.path, maps) ?? ref.path;
        if (valueAt(current, path) === expected) continue;
        const root = String(path[0]);
        if (path.length === 1) patch[root] = expected;
        else {
          if (!(root in patch)) patch[root] = JSON.parse(JSON.stringify(row(current)[root]));
          const parent = valueAt(patch, path.slice(0, -1));
          if (!parent || typeof parent !== "object") throw new Error(`Missing restored JSON path: ${source.key}.${path.join(".")}`);
          (parent as Record<string | number, unknown>)[path.at(-1)!] = expected;
        }
      }
      if (Object.keys(patch).length) {
        if (!source.writeReferencePatch) throw new Error(`No reference writer for ${source.key}`);
        await source.writeReferencePatch(db, companyId, id!, patch);
      }
    }
  }
}
