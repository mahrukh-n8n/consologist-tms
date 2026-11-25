import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const createTimeSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  date: z.string().min(1),
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  description: z.string().max(2000).default(""),
});

export function listTimeRecords(db: PrismaClient, companyId: number, userId: number) {
  return db.timeRecord.findMany({
    where: { project: { group: { companyId } }, userId },
    include: { project: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 100,
  });
}

export async function gkCreateTimeRecord(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: z.infer<typeof createTimeSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new Error("A valid date is required.");
  return db.timeRecord.create({
    data: { projectId: input.projectId, userId, date, minutes: input.minutes, description: input.description },
  });
}
