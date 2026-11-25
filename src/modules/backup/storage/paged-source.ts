import type { PrismaClient } from "@/generated/prisma/client";
import type { DataSource } from "../registry/types";
/** Reuse the existing source export, including tenant filters and transformations.
 * Only its mapped delegate's final findMany is paged; unrelated lookups are intact. */
export function installPagedExport(source: DataSource, delegateName: string) {
  source.exportBatches = async function* (db, companyId, password, recovery) {
    // Query one record at a time: a small first row must never allow a later
    // page of hundreds of large JSON records to exceed the fixed worker budget.
    const pageRows = 1;
    let cursorId: number | string | undefined;
    for (;;) {
      let calls = 0, found = 0;
      const paged = new Proxy(db, { get(target, property) {
        const delegate = Reflect.get(target, property);
        if (property !== delegateName) return delegate;
        return new Proxy(delegate as object, { get(model, operation) {
          if (operation !== "findMany") return Reflect.get(model, operation);
          return async (args: Record<string, unknown> = {}) => {
            calls++;
            const find = Reflect.get(model, operation) as (args: unknown) => Promise<unknown[]>;
            const rows = await find.call(model, { ...args, orderBy: args.orderBy ?? { id: "asc" }, take: pageRows, skip: cursorId === undefined ? 0 : 1, ...(cursorId === undefined ? {} : { cursor: { id: cursorId } }) });
            found = rows.length;
            if (found) {
              const id = (rows[found - 1] as { id?: unknown }).id;
              if (typeof id !== "number" && typeof id !== "string") throw new Error(`Backup paging requires a selected row identity (${source.key})`);
              cursorId = id;
            }
            return rows;
          };
        } });
      } });
      const rows = password !== undefined && source.exportForBackup
        ? await source.exportForBackup(paged as PrismaClient, companyId, password, recovery)
        : await source.export(paged as PrismaClient, companyId);
      if (calls !== 1) throw new Error(`Backup paging contract requires one ${delegateName}.findMany per export (${source.key})`);
      if (rows.length) yield rows;
      if (found < pageRows) break;
    }
  };
}
