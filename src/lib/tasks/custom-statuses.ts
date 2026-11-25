import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const createCustomStatusSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4a86f7"),
});

export const archiveCustomStatusSchema = z.object({
  statusId: z.coerce.number().int().positive(),
});

export function listCustomStatuses(db: Db, companyId: number) {
  return db.customStatus.findMany({
    where: { companyId, archived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
}

export async function gkCreateCustomStatus(
  db: Db,
  companyId: number,
  input: z.infer<typeof createCustomStatusSchema>
) {
  const last = await db.customStatus.findFirst({
    where: { companyId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return db.customStatus.create({
    data: {
      companyId,
      name: input.name,
      color: input.color,
      order: (last?.order ?? 0) + 10,
    },
  });
}

export async function archiveCustomStatus(db: Db, companyId: number, statusId: number) {
  const result = await db.customStatus.updateMany({
    where: { id: statusId, companyId },
    data: { archived: true },
  });
  if (result.count !== 1) throw new Error("Custom status not found.");
}
