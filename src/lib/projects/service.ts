import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { ProjectRole } from "@/generated/prisma/enums";

type Db = PrismaClient;

export const createGroupSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const createProjectSchema = z.object({
  groupId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(""),
});

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
}

export function listGroups(db: Db, companyId: number, memberUserId?: number) {
  return db.projectGroup.findMany({
    where: { companyId, archivedAt: null },
    include: {
      projects: {
        where: {
          archivedAt: null,
          ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function gkCreateGroup(db: Db, companyId: number, userId: number, name: string) {
  const base = slug(name);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const uniqueName = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const exists = await db.projectGroup.findUnique({ where: { companyId_uniqueName: { companyId, uniqueName } }, select: { id: true } });
    if (exists) continue;
    return db.projectGroup.create({ data: { companyId, name, uniqueName, ownerId: userId } });
  }
  throw new Error("Could not allocate a unique group name.");
}

export async function createGroupAndNotify(db: Db, companyId: number, userId: number, name: string) {
  return gkCreateGroup(db, companyId, userId, name);
}

export async function gkCreateProject(
  db: Db,
  companyId: number,
  userId: number,
  input: z.infer<typeof createProjectSchema>
) {
  const group = await db.projectGroup.findFirst({
    where: { id: input.groupId, companyId, archivedAt: null },
    select: { id: true },
  });
  if (!group) throw new Error("Group not found in this workspace.");

  const base = slug(input.name);
  let uniqueName = base;
  for (let attempt = 2; attempt < 40; attempt += 1) {
    const exists = await db.project.findUnique({ where: { groupId_uniqueName: { groupId: group.id, uniqueName } }, select: { id: true } });
    if (!exists) break;
    uniqueName = `${base}-${attempt}`;
  }

  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { groupId: group.id, name: input.name, description: input.description || null, uniqueName, ownerId: userId },
    });
    await tx.projectMember.create({ data: { projectId: project.id, userId, role: ProjectRole.OWNER } });
    await tx.taskList.create({ data: { projectId: project.id, name: "All Tasks List", order: 0 } });
    const apps = await tx.application.findMany({
      where: { kind: "PROJECT", appKey: { in: ["tasks", "discussions", "files", "calendar"] } },
      select: { id: true },
    });
    for (const app of apps) {
      await tx.projectApplication.create({ data: { projectId: project.id, applicationId: app.id } });
    }
    return project;
  });
}
