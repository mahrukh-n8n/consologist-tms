import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const tagTitlesSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  titles: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
});
export const renameTagSchema = z.object({ tagId: z.coerce.number().int().positive(), title: z.string().trim().min(1).max(50) });
export const tagIdSchema = z.object({ tagId: z.coerce.number().int().positive() });

export function listTags(db: PrismaClient, companyId: number) {
  return db.tag.findMany({
    where: { companyId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { title: "asc" },
  });
}

export async function attachTags(db: PrismaClient, companyId: number, userId: number, taskId: number, titles: string[]) {
  const task = await db.task.findFirst({ where: { id: taskId, project: { group: { companyId } } }, select: { id: true } });
  if (!task) throw new Error("Task not found in this workspace.");
  return db.$transaction(async (tx) => {
    for (const title of [...new Set(titles.map((t) => t.trim()).filter(Boolean))]) {
      const tag = await tx.tag.upsert({
        where: { companyId_title: { companyId, title } },
        update: {},
        create: { companyId, title, ownerId: userId },
      });
      await tx.taskTag.upsert({
        where: { taskId_tagId: { taskId, tagId: tag.id } },
        update: {},
        create: { taskId, tagId: tag.id },
      });
    }
  });
}

export async function detachTag(db: PrismaClient, companyId: number, taskId: number, tagId: number) {
  const task = await db.task.findFirst({ where: { id: taskId, project: { group: { companyId } } }, select: { id: true } });
  if (!task) throw new Error("Task not found in this workspace.");
  await db.taskTag.deleteMany({ where: { taskId, tagId } });
}

export async function renameTag(db: PrismaClient, companyId: number, tagId: number, title: string) {
  const result = await db.tag.updateMany({ where: { id: tagId, companyId }, data: { title } });
  if (result.count !== 1) throw new Error("Tag not found.");
}

export async function deleteTag(db: PrismaClient, companyId: number, tagId: number) {
  const result = await db.tag.deleteMany({ where: { id: tagId, companyId } });
  if (result.count !== 1) throw new Error("Tag not found.");
}
