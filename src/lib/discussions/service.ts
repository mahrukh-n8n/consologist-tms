import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const createDiscussionSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  body: z.string().max(20000).default(""),
});

export function listDiscussions(db: PrismaClient, companyId: number, projectId?: number) {
  return db.discussion.findMany({
    where: { project: { group: { companyId }, ...(projectId ? { id: projectId } : {}) } },
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function gkCreateDiscussion(
  db: PrismaClient,
  companyId: number,
  userId: number,
  input: z.infer<typeof createDiscussionSchema>
) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, group: { companyId } },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
  return db.discussion.create({
    data: { projectId: input.projectId, title: input.title, body: input.body, createdById: userId },
  });
}
