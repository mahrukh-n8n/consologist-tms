import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const APP_KEY = "tasks";

export const saveSavedFilterSchema = z.object({
  title: z.string().trim().min(1, "Name is required").max(80),
  filter: z.record(z.string(), z.string()).default({}),
});

export const deleteSavedFilterSchema = z.object({
  savedFilterId: z.coerce.number().int().positive(),
});

export function listSavedFilters(db: Db, userId: number) {
  return db.savedSearch.findMany({
    where: { userId, appKey: APP_KEY },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, filter: true, createdAt: true },
  });
}

export async function saveSavedFilter(
  db: Db,
  userId: number,
  input: z.infer<typeof saveSavedFilterSchema>
) {
  return db.savedSearch.create({
    data: {
      userId,
      appKey: APP_KEY,
      title: input.title,
      filter: input.filter,
      isPublic: false,
    },
    select: { id: true, title: true, filter: true },
  });
}

export async function deleteSavedFilter(db: Db, userId: number, savedFilterId: number) {
  const row = await db.savedSearch.findFirst({
    where: { id: savedFilterId, userId, appKey: APP_KEY },
    select: { id: true },
  });
  if (!row) throw new Error("Saved filter not found.");
  await db.savedSearch.delete({ where: { id: row.id } });
}
