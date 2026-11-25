import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";

type Db = Pick<PrismaClient, "userCompanyRole" | "projectMember" | "project">;

/**
 * Project visibility.
 *
 * Workspace admins see every project. Everyone else sees only projects they
 * are a member of — project membership gates tasks, documents and files.
 */

export async function canSeeAllProjects(db: Db, userId: number, companyId: number): Promise<boolean> {
  const membership = await db.userCompanyRole.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  });
  return membership?.role === Role.SUPER_ADMIN || membership?.role === Role.ADMIN;
}

export function projectVisibilityWhere(
  companyId: number,
  userId: number,
  seeAll: boolean
): Prisma.ProjectWhereInput {
  return {
    group: { companyId },
    ...(seeAll ? {} : { members: { some: { userId } } }),
  };
}

/** Throws unless the actor is a project member (workspace admins bypass). */
export async function assertProjectMember(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<void> {
  const seeAll = await canSeeAllProjects(db, userId, companyId);
  if (seeAll) return;
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  if (!member) throw new Error("You are not a member of this project.");
}

/** Throws unless the actor may see the project. */
export async function assertProjectAccess(
  db: Db,
  companyId: number,
  userId: number,
  projectId: number
): Promise<void> {
  const seeAll = await canSeeAllProjects(db, userId, companyId);
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectVisibilityWhere(companyId, userId, seeAll) },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace.");
}
