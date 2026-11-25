const READ_METHODS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class ReadOnlyToolError extends Error {
  constructor(operation: string) {
    super(`READ MCP tool cannot call ${operation}.`);
    this.name = "ReadOnlyToolError";
  }
}

function isReadQuery(query: unknown): boolean {
  const sql = Array.isArray(query)
    ? query.join("?")
    : query && typeof query === "object" && "sql" in query && typeof query.sql === "string"
      ? query.sql
      : "";
  const mutationKeywords = /;|\b(INSERT|UPDATE|DELETE|UPSERT|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|LOCK)\b/i;
  return /^\s*SELECT\b/i.test(sql) && !mutationKeywords.test(sql);
}

export function readOnlyDb<TDb>(db: TDb): TDb {
  const client = db as Record<string | symbol, unknown>;

  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof property !== "string") return value;

      if (property === "$transaction") {
        return (callback: unknown, options?: unknown) => {
          if (typeof callback !== "function") {
            throw new ReadOnlyToolError("$transaction(array)");
          }
          return (value as (handler: (transaction: unknown) => unknown, options?: unknown) => unknown)
            .call(target, (transaction: unknown) => callback(readOnlyDb(transaction)), options);
        };
      }

      if (property === "$queryRaw") {
        return (...args: unknown[]) => {
          if (!isReadQuery(args[0])) throw new ReadOnlyToolError("$queryRaw(non-SELECT)");
          return (value as (...queryArgs: unknown[]) => unknown).apply(target, args);
        };
      }

      if (typeof value === "function") {
        return () => {
          throw new ReadOnlyToolError(property);
        };
      }
      if (value && typeof value === "object") {
        return new Proxy(value, {
          get(model, method) {
            const operation = Reflect.get(model, method);
            if (typeof method !== "string" || typeof operation !== "function") return operation;
            if (!READ_METHODS.has(method)) {
              return () => {
                throw new ReadOnlyToolError(`${property}.${method}`);
              };
            }
            return operation.bind(model);
          },
        });
      }
      return value;
    },
  }) as TDb;
}
