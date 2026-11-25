import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { readOnlyDb } from "@/modules/mcp/services/read-only-db";

const mcpReadOnlyScope = new AsyncLocalStorage<boolean>();

export function runMcpReadOnly<T>(handler: () => Promise<T>): Promise<T> {
  return mcpReadOnlyScope.run(true, handler);
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Lazy singleton — avoids instantiation during `next build` when
// DATABASE_URL is intentionally absent from the build environment.
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return mcpReadOnlyScope.getStore() ? readOnlyDb(globalForPrisma.prisma) : globalForPrisma.prisma;
}

// Keep the named export for backward compatibility, but make it lazy
// via a Proxy so the client is only created when actually accessed.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
