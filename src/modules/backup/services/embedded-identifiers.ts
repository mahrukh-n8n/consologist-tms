import type { BackupIdMaps } from "../registry/types";
/** One replacement pass: a newly assigned ID must never be remapped again just
 * because it is also another row's old ID. These are pipeline line identifiers. */
export function remapEmbeddedIdentifiers(value: string, maps: BackupIdMaps): string {
  return value.replace(/run(\d+)(?=\D|$)|launch(\d+)(?=\D|$)/g, (_whole, run: string | undefined, account: string | undefined) => {
    const target = run ? "amazon-report-runs" : "accounts";
    const id = maps[target]?.get(Number(run ?? account));
    if (typeof id !== "number") throw new Error(`Restore blocked: unmapped embedded ${target}[${run ?? account}]`);
    return `${run ? "run" : "launch"}${id}`;
  });
}
