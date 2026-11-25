import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const createEventSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).default(""),
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  allDay: z.boolean().default(false),
});

export function listEvents(db: PrismaClient, companyId: number, projectId?: number) {
  return db.calendarEvent.findMany({
    where: { project: { group: { companyId }, ...(projectId ? { id: projectId } : {}) } },
    include: { project: { select: { name: true } } },
    orderBy: { startAt: "asc" },
    take: 100,
  });
}

export async function gkCreateEvent(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: z.infer<typeof createEventSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw new Error("A valid start date is required.");
  const endAt = input.endAt ? new Date(input.endAt) : null;
  if (endAt && endAt < startAt) throw new Error("End cannot be before start.");
  return db.calendarEvent.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      startAt,
      endAt,
      allDay: input.allDay,
      createdById: userId,
    },
  });
}
